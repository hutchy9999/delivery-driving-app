'use strict';

// Device-only connection settings; deliberately excluded from normal backups.
const TrafficSettings = (() => {
  function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
  const config=()=>({key:read('sp.googleRoutesKey',''),enabled:read('sp.trafficEnabled',false)===true});
  const month=()=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit'}).format(new Date());
  function usage(){const saved=read('sp.trafficUsage',{});return {month:month(),count:saved.month===month()&&Number.isInteger(saved.count)&&saved.count>=0?saved.count:0,limit:4500};}
  function render(host){
    const current=config(),used=usage();
    host.innerHTML=`<section class="card"><h2>Live traffic estimates</h2>
      <form id="traffic-settings-form"><label class="field"><span>Google browser API key</span><input id="traffic-key" type="password" autocomplete="off" spellcheck="false" maxlength="200" value="${esc(current.key)}" aria-describedby="traffic-key-help"></label>
      <p class="muted small" id="traffic-key-help">Restrict this browser key to https://hutchy9999.github.io/* and allow Routes API + Maps JavaScript API. Stored on this device only; excluded from backups and GitHub.</p>
      <p class="small">When enabled, uploading an offer requests a fresh foreground GPS position and sends it with pickup/drop-off postcodes to Google Maps for driving times. The screenshot is read locally and is not sent to Google. No background tracking.</p>
      <label class="field"><span>Default collection wait (minutes)</span><input id="traffic-wait" type="number" inputmode="decimal" min="0" max="90" step="0.5" value="${esc(store.settings.trafficWaitMins ?? 8)}"></label>
      <p class="muted small">Separate from the existing mileage-only stop allowance. Traffic estimates add this wait plus your parking/handover allowance per drop-off. After 3 separate recorded waits at a matched branch, its lifetime average replaces this default. Screenshots and Simple job completion alone cannot measure a restaurant wait.</p>
      <p class="error" id="traffic-settings-error" role="alert" hidden></p>
      <button class="btn primary" type="submit">Save key & enable traffic</button><button class="btn" type="button" id="traffic-off">Turn off & remove key</button>
      <p class="small" id="traffic-settings-status" role="status">${current.enabled?'Enabled on this device.':'Off.'} Key validation occurs on the first route request.</p>
      <p class="muted small">${used.count} of ${used.limit} reserved routing requests this month on this device. This counter is not Google’s billing total; other devices/apps share your account allowance. Use Google Cloud quotas as well. Each estimate reserves two requests, including failed attempts.</p>
      <p class="small"><a href="privacy.html" target="_blank" rel="noopener">Privacy</a> · <a href="terms.html" target="_blank" rel="noopener">Terms</a></p>
      </form></section>`;
    const form=host.querySelector('form'),error=host.querySelector('#traffic-settings-error'),status=host.querySelector('#traffic-settings-status');
    form.onsubmit=event=>{
      event.preventDefault();error.hidden=true;
      const key=host.querySelector('#traffic-key').value.trim(),text=host.querySelector('#traffic-wait').value,wait=Number(text);
      if(!/^[A-Za-z0-9_-]{20,200}$/.test(key)){error.textContent='Enter your Google browser API key.';error.hidden=false;return;}
      if(text===''||!Number.isFinite(wait)||wait<0||wait>90){error.textContent='Enter a collection wait from 0 to 90 minutes.';error.hidden=false;return;}
      try{localStorage.setItem('sp.googleRoutesKey',JSON.stringify(key));store.settings={...store.settings,trafficWaitMins:wait};localStorage.setItem('sp.trafficEnabled','true');status.textContent='Saved and enabled. Upload an offer screenshot to calculate traffic. If you changed a previously used key, reload the app first.';}
      catch{error.textContent='Could not save the connection settings on this device.';error.hidden=false;}
    };
    host.querySelector('#traffic-off').onclick=()=>{try{localStorage.setItem('sp.trafficEnabled','false');localStorage.removeItem('sp.googleRoutesKey');host.querySelector('#traffic-key').value='';status.textContent='Traffic off. Key removed from this device.';}catch{error.textContent='Could not update connection settings.';error.hidden=false;}};
  }
  return {config,usage,render};
})();
