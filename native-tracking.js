/* APK-only adapter. Native service owns background sampling; web UI stays shared. */
(function(root){
  'use strict';
  const plugin=root.Capacitor?.Plugins?.ShiftTracker;
  if(!plugin){root.NativeTracking=null;return;}
  let busy=false,lastJob='',failedShift='',offerTarget=null,lastState={},notice='';
  const enabled=()=>load('sp.nativeTrackingEnabled',false)===true;
  const activeOrder=()=>store.order?.acceptedAt&&store.order.id?store.order:null;
  const targetPoint=point=>point&&Number.isFinite(point.lat)&&Number.isFinite(point.lng)&&Math.abs(point.lat)<=90&&Math.abs(point.lng)<=180;
  function offer(id,place,googleTarget){
    const known=EarningsAreas.point(place?.loc)||EarningsAreas.point(place?.spot);
    offerTarget=known?{id,...known,precise:!place?.postcodeOnly}:targetPoint(googleTarget)?{id,...googleTarget,precise:false}:null;
    lastJob='';
  }
  function applyEvent(event){
    if(event.kind!=='collection-stop'||typeof event.jobId!=='string'||!Number.isFinite(event.minutes)||event.minutes<0.5||event.minutes>90||!targetPoint(event)||!Number.isFinite(event.arrived)||!Number.isFinite(event.departed)||event.departed<=event.arrived)return false;
    const deliveries=store.deliveries,order=activeOrder();
    const record=deliveries.find(d=>d.id===event.jobId)||(order?.id===event.jobId?order:null);
    if(!record)return null; // Retain for a later restore/reconciliation; don't drop unmatched evidence.
    if(record.collectionStop?.eventId===event.id)return false;
    if(record.collectionStop?.eventId)return false; // One collection stop per current single-pickup job.
    const withinJob=(!record.acceptedAt||event.arrived>=+new Date(record.acceptedAt)-30000)&&(!record.completedAt||event.departed<=+new Date(record.completedAt)+30000);
    const stop={eventId:event.id,source:'native-gps',minutes:event.minutes,eligible:event.eligible===true&&withinJob,
      arrivedAt:new Date(event.arrived).toISOString(),departedAt:new Date(event.departed).toISOString(),accuracy:event.accuracy,samples:event.samples};
    root.Diagnostics?.record('collection_reconciled',{eligible:stop.eligible,accuracy:event.accuracy,samples:event.samples});
    const location={lat:event.lat,lng:event.lng,source:'native-gps',accuracy:event.accuracy,capturedAt:new Date(event.departed).toISOString()};
    let place=getPlace(record.placeId);
    const pc=TrafficModel.postcode(record.offerDetails?.pickup),name=String(record.restaurantName||record.offerDetails?.pickup||'').split(/[,\n]/)[0].trim();
    if(!place&&pc&&name){
      place=TrafficModel.matchPlace(name+', '+pc,store.places);
      const same=store.places.filter(p=>p.postcode===pc&&p.name.toLowerCase()===name.toLowerCase());
      if(!place&&!same.length&&stop.eligible){place={id:newId(),name,postcode:pc,area:pc,note:'',parkType:'',parkLimit:'',ease:'',spot:null,waits:[],loc:{lat:event.lat,lng:event.lng},autoLearned:true};store.places=[...store.places,place];}
    }
    const updated={...record,collectionStop:stop,pickupLocation:record.pickupLocation||location,...(place?{placeId:place.id}:{})};
    if(deliveries.some(d=>d.id===record.id))store.deliveries=deliveries.map(d=>d.id===record.id?updated:d);
    else store.order=updated;
    if(place&&stop.eligible){const waits=(place.waits||[]).filter(w=>w.orderId!==record.id);waits.push({orderId:record.id,platformId:record.platformId||null,at:stop.departedAt,mins:event.minutes,source:'native-gps'});updatePlace(place.id,{waits});}
    if(offerTarget?.id===record.id)offerTarget=null;
    return true;
  }
  async function sync(){
    if(busy||document.hidden)return;
    busy=true;
    try{
      const state=await plugin.state();lastState=state;
      const active=store.active;
      if(!enabled()||!active?.id){if(state.shiftId||state.running){await plugin.stop();lastState={};}lastJob='';failedShift='';}
      else if((!state.paused||state.shiftId!==active.id)&&(!state.running||state.shiftId!==active.id)&&failedShift!==active.id){
        failedShift=active.id;
        await plugin.start({shiftId:active.id});failedShift='';lastJob='';
      }
      const order=activeOrder();
      if(enabled()&&active?.id&&order?.shiftId===active.id){
        let target=offerTarget?.id===order.id?offerTarget:null;
        const place=getPlace(order.placeId),known=EarningsAreas.point(place?.loc)||EarningsAreas.point(place?.spot);
        if(!target&&known)target={...known,precise:!place?.postcodeOnly};
        const signature=JSON.stringify({id:order.id,shiftId:active.id,...(target?{lat:target.lat,lng:target.lng,precise:target.precise}:{} )});
        if(signature!==lastJob){await plugin.setJob({job:{...JSON.parse(signature),expiresAt:Date.now()+6*3600000}});lastJob=signature;}
      }else if(lastJob){await plugin.setJob({job:{}});lastJob='';offerTarget=null;}
      const {events=[]}=await plugin.events();const acknowledged=[];let changed=false;
      for(const event of events){const applied=applyEvent(event);if(applied!==null)acknowledged.push(event.id);if(applied)changed=true;}
      if(acknowledged.length)await plugin.acknowledge({ids:acknowledged});
      if(changed){notice='Collection stop estimate saved';if(['#home','#history','#places'].includes(location.hash)&&!document.activeElement?.matches('input,textarea,select'))render();}
    }catch(error){notice=error.message||'GPS tracking unavailable. Check Settings.';root.Diagnostics?.record('native_sync_error',{error:error.name||'Error'});}
    finally{busy=false;decorate();}
  }
  function decorate(){
    if(location.hash==='#settings'){
      let host=document.getElementById('native-settings');
      if(!host){host=document.createElement('section');host.id='native-settings';host.className='card';document.getElementById('view').prepend(host);}
      // Repaint only on state changes; never replace a pressed button.
      const fingerprint=JSON.stringify([enabled(),lastState.running,lastState.paused,lastState.samples,lastState.gaps,notice]);
      if(host.dataset.state===fingerprint||host.querySelector('button:active'))return;host.dataset.state=fingerprint;
      host.innerHTML=`<h2>Android shift GPS · trial</h2><button class="btn primary" id="native-enable">${enabled()?'Turn shift GPS off':'Enable shift GPS'}</button>${enabled()?'<button class="btn" id="native-resume">Resume / check GPS permission</button>':''}<p class="small" role="status">${esc(notice||lastState.reason||(lastState.running?'GPS recording this shift':enabled()?'Ready · recording starts with your shift':'Off'))}</p><p class="muted small">While on shift, records your route locally even when Just Eat/Maps is open or the screen is locked. The ongoing Android notification has a pause action. Tracking stops at End Shift. No raw GPS trace is uploaded.</p><p class="muted small">${num(lastState.miles||0)} mi estimated · ${lastState.samples||0} fixes · ${lastState.gaps||0} long gaps. GPS mileage is approximate; keep using odometer readings for final shift costs.</p><p class="muted small">Collection-stop estimates include parking/walking and need real-shift validation. Known pickup points support shorter stops; postcode-only targets require stronger evidence. Uncertain stops are retained but excluded from learned averages. Force-stop/revoked permission can interrupt recording; open the app to resume.</p><button class="btn" id="native-app-settings">Android app permissions & battery</button><p class="muted small">To move your existing records, use Your data → Restore from backup file. GPS starts off after a restore; enable it again when ready.</p>`;
      host.querySelector('#native-enable').onclick=async()=>{save('sp.nativeTrackingEnabled',!enabled());notice='';failedShift='';if(!enabled())await plugin.stop();host.dataset.state='';sync();};
      const resume=host.querySelector('#native-resume');if(resume)resume.onclick=async()=>{notice='';failedShift='';if(store.active?.id)try{await plugin.start({shiftId:store.active.id});}catch(error){notice=error.message;}host.dataset.state='';sync();};
      host.querySelector('#native-app-settings').onclick=()=>plugin.openAppSettings();
    }
    if(!location.hash||location.hash==='#home'){
      let status=document.getElementById('native-shift-status');if(!status){status=document.createElement('p');status.id='native-shift-status';status.className='muted small';document.querySelector('.active-shift,.shift-start')?.append(status);}
      status.textContent=notice||(enabled()?(lastState.running?`GPS recording · ${num(lastState.miles||0)} mi estimated${lastState.gaps?' · gaps recorded':''}`:lastState.paused?'GPS paused · resume in Settings':'Shift GPS ready'):'Android shift GPS is off · enable in Settings');
    }
  }
  async function restore(data){
    save('sp.nativeTrackingEnabled',false);await plugin.restoreTracking({data:data.nativeTracking||{}});lastJob='';offerTarget=null;failedShift='';notice='Backup imported. Shift GPS is off until you enable it.';
  }
  const exportFile=async(filename,text,type,includeTracking=false,includeDiagnostics=false)=>{try{return (await plugin.exportFile({filename,text,type,includeTracking,includeDiagnostics})).saved===true;}catch(error){root.Diagnostics?.record('file_save_error',{error:error.name||'Error'});toast(error.message||'Could not save the file');return false;}};
  function endShift(){lastJob='';offerTarget=null;failedShift='';return plugin.stop().catch(()=>{notice='Could not stop GPS. Use Pause tracking in the Android notification.';});}
  root.NativeTracking={isNative:true,sync,offer,restore,exportFile,endShift};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
  setInterval(sync,5000);
})(window);
