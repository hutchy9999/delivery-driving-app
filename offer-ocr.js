/* Local screenshot OCR. Only runtime/model downloads leave the browser;
   selected image bytes and recognized text are never sent to a server. */
(function(root) {
  'use strict';
  const unique = values => [...new Set(values)];
  function parse(text) {
    const lines = String(text).replace(/\r/g,'').split('\n').map(line=>line.trim()).filter(Boolean);
    const warnings = [];
    const amount = line => [...line.matchAll(/£\s*(\d+(?:[.,]\d{1,2})?)/g)].map(match=>Number(match[1].replace(',','.')));
    const distance = line => [...line.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:miles?|mi)\b/gi)].map(match=>Number(match[1].replace(',','.')));
    function choose(extract, preferred, label) {
      const preferredValues = unique(lines.filter(line=>preferred.test(line)).flatMap(extract));
      const all = unique(lines.flatMap(extract));
      if (preferredValues.length === 1) return preferredValues[0];
      if (!preferredValues.length && all.length === 1) return all[0];
      warnings.push(all.length ? `Several ${label} found. Check and enter the total manually.` : `Could not identify ${label}. Enter it manually.`);
      return null;
    }
    const fee = choose(amount,/\btotal\b|\byou(?:'|’)ll earn\b|\bestimated earnings\b/i,'payments');
    const miles = choose(distance,/\btotal\b.*\b(?:distance|miles?|mi)\b|\btotal distance\b/i,'distances');
    let section = null, pickup = [], dropoffs = [], current = [];
    const flush = () => {
      const value = current.join(', ').replace(/,\s*,/g,',').trim();
      if (value && section === 'pickup') pickup.push(value);
      if (value && section === 'dropoff') dropoffs.push(value);
      current = [];
    };
    for (const line of lines) {
      const marker = line.match(/^(?:\d+[.)]?\s*)?(pick[ -]?up(?:\s+(?:address|location))?|collection(?:\s+(?:address|point))?|collect(?:\s+from)?|restaurant|drop[ -]?off(?:\s+(?:address|location))?|deliver(?:y)?\s+(?:to|address)|customer(?:\s+address)?)(?:\s*\d+)?\s*(?::|[-–])?\s*(.*)$/i);
      if (marker) { flush();section=/^(?:drop|deliver|customer)/i.test(marker[1])?'dropoff':'pickup';if(marker[2])current.push(marker[2]);continue; }
      if (/^(?:accept|decline|confirm|offer expires|earnings|total|distance|estimated|[£\d]+\s*(?:miles?|mi|min|minutes)|directions|order details|delivery details)\b/i.test(line) || /^£/.test(line)) {flush();section=null;continue;}
      if (section && current.length<5) current.push(line);
    }
    flush();
    if (pickup.length !== 1) warnings.push('Pickup could not be identified uniquely. Check the address details.');
    if (!dropoffs.length) warnings.push('No clearly labelled drop-off address found. Add it if shown.');
    return {fee,miles,pickup:pickup.length===1?pickup[0]:'',dropoffs,warnings};
  }
  let library;
  function loadLibrary() {
    if (root.Tesseract) return Promise.resolve(root.Tesseract);
    if (!library) library = new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';script.crossOrigin='anonymous';
      script.onload=()=>root.Tesseract?resolve(root.Tesseract):reject(new Error('OCR software unavailable'));
      script.onerror=()=>reject(new Error('Could not download OCR software'));document.head.appendChild(script);
    }).catch(error=>{library=null;throw error;});
    return library;
  }
  async function read(file,{signal,onProgress=()=>{}}={}) {
    if (!/^image\/(?:png|jpeg|webp|bmp)$/.test(file.type) || file.size>15*1024*1024) throw new Error('Choose a PNG, JPG or WebP screenshot under 15 MB.');
    let worker=null,bitmap=null,canvas=null;
    const abort=()=>{if(worker)worker.terminate().catch(()=>{});};
    signal?.addEventListener('abort',abort,{once:true});
    const check=()=>{if(signal?.aborted)throw new DOMException('Reading stopped','AbortError');};
    try {
      check();onProgress('Loading local reader… first use downloads the OCR software.');
      const engine=await loadLibrary();check();
      worker=await engine.createWorker('eng',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0',langPath:'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int',logger:message=>{if(message.status==='recognizing text')onProgress('Reading screenshot… '+Math.round(message.progress*100)+'%');}});check();
      bitmap=await createImageBitmap(file);check();
      const scale=Math.min(1,1600/bitmap.width,3500/bitmap.height);
      canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
      const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const result=await worker.recognize(canvas);check();
      const details=parse(result.data.text);
      if(result.data.confidence<60)details.warnings.unshift('Text quality was low. Check all extracted details carefully.');
      return details;
    } finally {
      signal?.removeEventListener('abort',abort);bitmap?.close();if(canvas){canvas.width=0;canvas.height=0;}
      if(worker)await worker.terminate().catch(()=>{});
    }
  }
  const api={parse,read};if(typeof module!=='undefined')module.exports=api;else root.OfferOCR=api;
})(typeof window==='undefined'?globalThis:window);
