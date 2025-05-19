/*──────────────────────────────────────────────────────────────
  Guitar‑Note Trainer – FULL script.js   (diagram restored)
──────────────────────────────────────────────────────────────*/

/* ---------- UI ELEMENTS ---------- */
const btnNew       = document.getElementById('new');
const delayBox     = document.getElementById('delay');
const diagramBox   = document.getElementById('diagram-time');
const scaleTypeSel = document.getElementById('scale-type');
const scaleRootSel = document.getElementById('scale-root');
const chordToggle  = document.getElementById('chord-mode');
const lblChord     = document.getElementById('chord');
const lblTarget    = document.getElementById('target');
const lblStat      = document.getElementById('status');
const diagramDiv   = document.getElementById('diagram');
const toggleBoxes  = document.querySelectorAll('#strings input[type=checkbox]');

/* ---------- CONSTANTS ---------- */
const MAJOR_STEPS = [0,2,4,5,7,9,11];
const MINOR_STEPS = [0,2,3,5,7,8,10];
const REF_MS = 1000, GUARD_MS = 150;
const CENT_TOL = 20;                         // ±20 cents

/* ---------- GLOBALS ---------- */
let target = null;               // { pitchClass, freq, string }
let stream, audioCtx, analyser, data, listening = false;
let chordState = null;           // { name, queue, idx }

/* ---------- HELPERS ---------- */
const pitchClass = n => n.replace(/\d+$/, '');
function activeStrings(){ return Array.from(toggleBoxes).filter(cb=>cb.checked).map(cb=>cb.dataset.string); }
function scalePCs(){
  if(scaleTypeSel.value==='chromatic') return NOTE_NAMES.slice();
  const rootIx = NOTE_NAMES.indexOf(scaleRootSel.value);
  const steps  = scaleTypeSel.value==='major' ? MAJOR_STEPS : MINOR_STEPS;
  return steps.map(s=>NOTE_NAMES[(rootIx+s)%12]);
}
scaleTypeSel.addEventListener('change',()=>{ scaleRootSel.disabled = (scaleTypeSel.value==='chromatic'); });
const centDiff = (f1,f2)=>1200*Math.log2(f1/f2);

/* ---------- AUDIO ---------- */
function playRef(freq){
  const o=audioCtx.createOscillator(),g=audioCtx.createGain();
  o.type='sine'; o.frequency.value=freq; g.gain.value=.15;
  o.connect(g).connect(audioCtx.destination); o.start();
  o.stop(audioCtx.currentTime+REF_MS/1000);
}
async function initAudio(){
  stream = await navigator.mediaDevices.getUserMedia({audio:true});
  audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  const hpf=audioCtx.createBiquadFilter(); hpf.type='highpass'; hpf.frequency.value=100;
  analyser = audioCtx.createAnalyser(); analyser.fftSize=2048;
  audioCtx.createMediaStreamSource(stream).connect(hpf).connect(analyser);
  data = new Float32Array(analyser.fftSize);
}
function detectPitch(buf,sr){
  const N=buf.length; let rms=0; for(let i=0;i<N;i++) rms+=buf[i]*buf[i];
  if(Math.sqrt(rms/N)<.03) return null;
  let r1=0,r2=N-1,th=.2;
  for(let i=0;i<N/2;i++) if(Math.abs(buf[i])<th){r1=i;break;}
  for(let i=1;i<N/2;i++) if(Math.abs(buf[N-i])<th){r2=N-i;break;}
  buf=buf.slice(r1,r2);
  const M=buf.length, c = new Array(M).fill(0);
  for(let lag=0;lag<M;lag++)
    for(let i=0;i<M-lag;i++) c[lag]+=buf[i]*buf[i+lag];
  let d=0; while(c[d]>c[d+1]) d++;
  let max=d,val=c[d];
  for(let i=d+1;i<M;i++) if(c[i]>val){val=c[i];max=i;}
  return sr/max;
}
function nearest(freq){
  let best=NOTE_TABLE[0], diff=Math.abs(freq-best.freq);
  for(const n of NOTE_TABLE){ const d=Math.abs(freq-n.freq); if(d<diff){diff=d;best=n;} }
  return best;                  // {name,freq,midi}
}

/* ---------- CHORD‑MODE BUILDERS ---------- */
function pickChord(){
  if(scaleTypeSel.value==='chromatic') return null;
  const pcs = scalePCs();
  const map = scaleTypeSel.value==='major'
      ? ['maj','min','min','maj','maj','min','dim']
      : ['min','dim','maj','min','min','maj','maj'];
  const deg = Math.floor(Math.random()*7);
  const q   = map[deg];
  return {
    name:`${pcs[deg]} ${q==='maj'?'major':q==='min'?'minor':'dim'}`,
    rootPC: pcs[deg],
    thirdSemis: q==='maj'?4:3,
    fifthSemis: q==='dim'?6:7     // dim = b5
  };
}
function fretPositions(pc){
  const list=[];
  for(const s of STRINGS){
    for(let f=0;f<=12;f++){
      const note=NOTE_TABLE.find(n=>n.midi===s.open+f);
      if(pitchClass(note.name)===pc) list.push({string:s,note});
    }
  }
  return list;
}
function makeChordQueue(ch){
  const active=activeStrings();
  const roots=fretPositions(ch.rootPC).filter(p=>active.includes(p.string.name));
  while(roots.length){
    const root=roots.splice(Math.floor(Math.random()*roots.length),1)[0];
    const idx = STRINGS.findIndex(s=>s.name===root.string.name);
    const patt=[[idx-2,idx-1],[idx+1,idx+2],[idx-1,idx+1]].filter(p=>p.every(i=>i>=0&&i<6));
    for(const pat of patt.sort(()=>Math.random()-.5)){
      const sA=STRINGS[pat[0]],sB=STRINGS[pat[1]];
      if(!active.includes(sA.name)||!active.includes(sB.name)) continue;
      const thirdMidi=root.note.midi+ch.thirdSemis;
      const fifthMidi=root.note.midi+ch.fifthSemis;
      for(const swap of[false,true]){
        const thirdStr=swap?sB:sA, fifthStr=swap?sA:sB;
        const tF=thirdMidi-thirdStr.open, fF=fifthMidi-fifthStr.open;
        if(tF>=0&&tF<=12&&fF>=0&&fF<=12){
          const thirdNote=NOTE_TABLE.find(n=>n.midi===thirdMidi);
          const fifthNote=NOTE_TABLE.find(n=>n.midi===fifthMidi);
          return [root,{string:thirdStr,note:thirdNote},{string:fifthStr,note:fifthNote}];
        }
      }
    }
  }
  return null;
}

/* ---------- CHORD DIAGRAM ---------- */
function showDiagram(name, queue){
  const dots=queue.map(p=>{
    const strIdx=STRINGS.findIndex(s=>s.name===p.string.name);
    const fret=p.note.midi-p.string.open;
    return {strIdx,fret};
  });
  const minF=Math.min(...dots.map(d=>d.fret));
  const topF=minF<=1?1:minF;
  const fretSpan=5;
  const W=140,H=20+20*fretSpan,left=20,strGap=20,top=20,fretGap=20;
  let svg=`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  for(let i=0;i<6;i++){const x=left+i*strGap;svg+=`<line x1="${x}" y1="${top}" x2="${x}" y2="${top+fretGap*fretSpan}" stroke="#000"/>`;}
  for(let i=0;i<=fretSpan;i++){const y=top+i*fretGap;svg+=`<line x1="${left}" y1="${y}" x2="${left+strGap*5}" y2="${y}" stroke="#000" ${i===0&&topF===1?'stroke-width="3"':''}/>`;}
  if(topF>1) svg+=`<text x="2" y="${top+12}" font-size="10">${topF}</text>`;
  dots.forEach(d=>{
    const cx=left+d.strIdx*strGap, cy=top+(d.fret-topF+1)*fretGap-fretGap/2;
    svg+=`<circle cx="${cx}" cy="${cy}" r="6" fill="#c33"/>`;
  });
  svg+='</svg>';
  diagramDiv.innerHTML=svg; diagramDiv.style.display='block';
}
function hideDiagram(){ diagramDiv.style.display='none'; diagramDiv.innerHTML=''; }

/* ---------- LISTENING LOOP ---------- */
function listenLoop(){
  if(!listening) return;
  analyser.getFloatTimeDomainData(data);
  const f=detectPitch(data,audioCtx.sampleRate);
  if(f){
    const best=nearest(f), pc=pitchClass(best.name), cents=centDiff(f,best.freq);
    if(pc===target.pitchClass && Math.abs(cents)<=CENT_TOL){
      lblTarget.className='good';
      lblStat.textContent=`Correct! (${best.name}, ${cents.toFixed(1)} ¢)`;
      listening=false;

      if(chordToggle.checked && chordState){
        chordState.idx++;
        if(chordState.idx<chordState.queue.length){
          setTimeout(()=>startNote(chordState.queue[chordState.idx]),500);
        }else{
          showDiagram(chordState.name,chordState.queue);
          const wait=Math.max(0,Number(diagramBox.value)||5)*1000;
          setTimeout(()=>{hideDiagram(); lblChord.textContent=''; chordState=null; pickTask();}, wait);
        }
      }else{
        const d=Math.max(0,Number(delayBox.value)||2)*1000;
        setTimeout(pickTask,d);
      }
      return;
    }
    lblStat.textContent=`Heard ${pc} – ${cents.toFixed(1)} ¢ off`;
  }
  requestAnimationFrame(listenLoop);
}

/* ---------- PROMPT A NOTE ---------- */
function startNote(pos){
  target={pitchClass:pitchClass(pos.note.name),freq:pos.note.freq,string:pos.string.name};
  const disp=chordToggle.checked?pos.note.name:target.pitchClass;
  lblTarget.textContent=`Play ${disp} on the ${target.string} string`;
  lblTarget.className=''; lblStat.textContent='';
  playRef(target.freq);
  setTimeout(()=>{listening=true;listenLoop();},REF_MS+GUARD_MS);
}

/* ---------- TASK PICKER ---------- */
async function pickTask(){
  listening=false; hideDiagram();
  if(!audioCtx) await initAudio();

  if(chordToggle.checked){
    const chord=pickChord();
    if(!chord){lblStat.textContent='Chord mode needs a major or minor key.';return;}
    const queue=makeChordQueue(chord);
    if(!queue){lblStat.textContent='No valid string pattern for that chord.';return;}
    chordState={name:chord.name,queue,idx:0};
    lblChord.textContent=`Chord: ${chord.name}`;
    startNote(queue[0]); return;
  }

  chordState=null; lblChord.textContent='';
  const strings=STRINGS.filter(s=>activeStrings().includes(s.name));
  if(!strings.length){lblStat.textContent='Select at least one string ⬆️';return;}
  const allowed=scalePCs(), cand=[];
  for(const s of strings){
    for(let f=0;f<=12;f++){
      const note=NOTE_TABLE.find(n=>n.midi===s.open+f);
      if(allowed.includes(pitchClass(note.name))) cand.push({string:s,note});
    }
  }
  if(!cand.length){lblStat.textContent='No notes fit that scale on those strings.';return;}
  startNote(cand[Math.floor(Math.random()*cand.length)]);
}

/* ---------- GO ---------- */
btnNew.addEventListener('click', pickTask);