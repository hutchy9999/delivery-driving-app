/* Google-only foreground routing, explicitly enabled by the device owner.
   Images, customer names and full address text are never sent by this module.
   Route results stay in memory and never enter backups or the earnings map. */
(function(root){
  'use strict';
  let sdkPromise=null,sdkKey=null;
  function library(key){
    if(sdkKey&&sdkKey!==key)return Promise.reject(Error('Reload the app to use the changed Google key.'));
    if(sdkPromise)return sdkPromise;
    sdkKey=key;
    sdkPromise=new Promise((resolve,reject)=>{
      let script;
      const fail=()=>{script?.remove();sdkPromise=null;reject(Error('Google could not load. Check the key, API restrictions, billing and connection.'));};
      const ready=()=>{if(!root.google?.maps?.importLibrary)return fail();root.google.maps.importLibrary('routes').then(resolve,fail);};
      if(root.google?.maps?.importLibrary)return ready();
      root.__shiftTrafficGoogleReady=ready;root.gm_authFailure=fail;
      script=document.createElement('script');script.async=true;
      script.src='https://maps.googleapis.com/maps/api/js?'+new URLSearchParams({key,v:'weekly',loading:'async',callback:'__shiftTrafficGoogleReady',language:'en',region:'GB'});
      script.onerror=fail;document.head.append(script);
    });
    return sdkPromise;
  }
  async function reserve(){
    const run=()=>{const value=TrafficSettings.usage();if(value.count+2>value.limit)throw Error('This phone’s monthly traffic limit has been reached. Using the mileage estimate.');
      value.count+=2;try{localStorage.setItem('sp.trafficUsage',JSON.stringify(value));}catch{throw Error('Could not save the usage counter. Traffic lookup skipped.');}};
    if(root.navigator?.locks)return navigator.locks.request('shift-profit-traffic',run);
    return run();
  }
  function gps(signal){return new Promise((resolve,reject)=>{
    if(!navigator.geolocation||document.hidden)return reject(Error('Location unavailable. Using the mileage estimate.'));
    let watch=null,best=null,done=false;
    const finish=(error,point)=>{if(done)return;done=true;clearTimeout(timeout);if(watch!==null)navigator.geolocation.clearWatch(watch);signal.removeEventListener('abort',abort);error?reject(error):resolve(point);};
    const abort=()=>finish(Error('Traffic estimate cancelled.'));
    const started=Date.now();
    const timeout=setTimeout(()=>best?finish(null,best):finish(Error('No sufficiently accurate location within 5 seconds. Using the mileage estimate.')),5000);
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted)return abort();
    try{watch=navigator.geolocation.watchPosition(position=>{
      const c=position.coords;
      if(![c.latitude,c.longitude,c.accuracy,position.timestamp].every(Number.isFinite)||Math.abs(c.latitude)>90||Math.abs(c.longitude)>180||c.accuracy<0||c.accuracy>100||position.timestamp<started-1000||position.timestamp>Date.now()+1000)return;
      const point={lat:c.latitude,lng:c.longitude,accuracy:c.accuracy};if(!best||point.accuracy<best.accuracy)best=point;if(point.accuracy<=30)finish(null,point);
    },()=>finish(Error('Location permission blocked or unavailable. Using the mileage estimate.')),{enableHighAccuracy:true,maximumAge:0,timeout:5000});if(done)navigator.geolocation.clearWatch(watch);}
    catch{finish(Error('Location unavailable. Using the mileage estimate.'));}
  });}
  function create(onChange){
    let active=null;
    const emit=value=>{root.Diagnostics?.record('traffic_status',{status:value.status});onChange(value);};
    function cancel(message){if(active){clearTimeout(active.timer);active.controller.abort();active=null;}emit({status:message?'fallback':'idle',message:message||'',result:null});}
    function begin(){
      cancel();const c=TrafficSettings.config();if(!c.enabled||!c.key)return;
      if(navigator.onLine===false)return emit({status:'fallback',message:'Offline. Using the mileage estimate.',result:null});
      const controller=new AbortController(),session=active={controller,key:c.key,started:Date.now(),running:false,timer:null};
      session.timer=setTimeout(()=>{if(active===session)cancel('Traffic estimate reached the 10-second limit. Using the mileage estimate.');},10000);
      session.fix=gps(controller.signal);session.sdk=library(c.key);
      // GPS/SDK start alongside OCR, with handlers even before addresses arrive.
      session.fix.catch(error=>{if(active===session)cancel(error.message);});session.sdk.catch(error=>{if(active===session)cancel(error.message);});
      emit({status:'finding',message:'Finding your position and preparing traffic…',result:null});
    }
    async function addresses(details,stopInfo){
      const session=active;if(!session||session.running)return;
      const pickup=TrafficModel.postcode(details?.pickup),drops=(details?.dropoffs||[]).map(TrafficModel.postcode);
      if(!pickup||!drops.length||drops.some(pc=>!pc)||drops.length>5)return cancel('Traffic needs a full pickup postcode and 1–5 drop-off postcodes. Using the mileage estimate.');
      session.running=true;emit({status:'routing',message:'Calculating traffic-aware driving time…',result:null});
      const permitted=()=>{if(active!==session||session.controller.signal.aborted)return false;const c=TrafficSettings.config();if(!c.enabled||c.key!==session.key){cancel('Traffic disabled or key changed. Using the mileage estimate.');return false;}return true;};
      try{
        const [origin,{Route}]=await Promise.all([session.fix,session.sdk]);
        if(!permitted())return;
        await reserve();if(!permitted())return;
        const common={travelMode:'DRIVING',routingPreference:'TRAFFIC_AWARE',fields:['durationMillis','distanceMeters'],region:'uk',language:'en-GB',computeAlternativeRoutes:false,optimizeWaypointOrder:false};
        // Addresses are reduced to full UK postcodes, sent directly to Google.
        const point=pc=>pc+', UK';
        const firstResponse=await Route.computeRoutes({...common,fields:root.NativeTracking?.isNative?[...common.fields,'legs.endLocation']:common.fields,origin:{lat:origin.lat,lng:origin.lng},destination:point(pickup)});
        const first=TrafficModel.routeValues(firstResponse);
        const end=root.NativeTracking?.isNative?firstResponse.routes?.[0]?.legs?.[0]?.endLocation:null;
        const pickupTarget=end?{lat:typeof end.lat==='function'?end.lat():end.lat,lng:typeof end.lng==='function'?end.lng():end.lng}:null;
        if(!permitted())return;
        const second=TrafficModel.routeValues(await Route.computeRoutes({...common,origin:point(pickup),destination:point(drops[drops.length-1]),intermediates:drops.slice(0,-1).map(pc=>({location:point(pc)})),departureTime:new Date(Date.now()+(first.minutes+stopInfo.wait)*60000)}));
        if(!permitted())return;
        clearTimeout(session.timer);session.controller.abort();active=null;
        emit({status:'ready',message:'Traffic included · postcode-centre routes',result:{drive:first.minutes+second.minutes,miles:(first.metres+second.metres)/1609.344,
          total:first.minutes+second.minutes+stopInfo.total,stops:stopInfo,accuracy:origin.accuracy,at:Date.now(),...(pickupTarget?{pickupTarget}:{})}});
      }catch(error){
        const known=['This phone’s monthly traffic limit has been reached. Using the mileage estimate.','Could not save the usage counter. Traffic lookup skipped.','Live traffic unavailable. Using the mileage estimate.','No usable driving route returned. Using the mileage estimate.'];
        if(active===session)cancel(known.includes(error.message)?error.message:'Traffic lookup failed. Check Google API restrictions/billing or continue with the mileage estimate.');
      }
    }
    return {begin,addresses,cancel};
  }
  const preload=()=>{const c=TrafficSettings.config();if(c.enabled&&c.key)library(c.key).catch(()=>{});};
  root.OfferTraffic={create,preload};
})(window);
