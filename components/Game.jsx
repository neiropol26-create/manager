"use client";
import { useReducer, useEffect, useRef, useState } from "react";
import {
  COUNTERS_META, SAFE_MIN, SAFE_MAX, DIFFICULTY,
  ARCS_INDIVIDUAL, ARCS_LEGAL, ALL_ARCS,
  EVENTS, PROFESSIONAL_RISK, SUCCESS_EVENTS, BACKGROUND_EVENTS, MILESTONES, ICONS,
  splitLabel
} from "../lib/gameData";

function freshCounters(){ return { time:50, money:50, legality:50, reputation:50 }; }
function clamp(v){ return Math.max(0, Math.min(100, v)); }
function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function pickN(arr,n){ return shuffle(arr).slice(0,n); }
function gaugeClass(v){
  return v<SAFE_MIN+10||v>SAFE_MAX-10 ? (v<=SAFE_MIN||v>=SAFE_MAX?"danger":"warn") : "ok";
}

const BREACH_TEXT = {
  time_low:{title:"Выгорание", desc:"Вы не успеваете физически. Суд рассматривает вопрос о вашей замене — по состоянию здоровья дальше вести процедуры вы не можете."},
  time_high:{title:"Полное бездействие", desc:"Вы забросили все процедуры. СРО интересуется, чем вы вообще занимались последние месяцы."},
  money_low:{title:"Нечем работать", desc:"Финансировать процедуры больше не на что. Кредиторы требуют отчёта, суд — тоже."},
  money_high:{title:"Утрата интереса", desc:"Дела идут сами по себе, а вам, кажется, уже всё равно. Возможно, пора менять профессию."},
  legality_low:{title:"За гранью допустимого", desc:"Ваши решения вышли за пределы того, что можно оправдать. Заявление об отстранении уже у судьи."},
  legality_high:{title:"Формализм ради формализма", desc:"Бессмысленные, но «правильные» действия без реального результата — суд взыскивает с вас убытки за нецелесообразность."},
  reputation_low:{title:"Утрата доверия", desc:"Кредиторы больше вам не верят. СРО отказывает в дальнейших назначениях."},
  reputation_high:{title:"Подозрительно гладко", desc:"Все настолько довольны, что заподозрили сговор. Начата проверка на предмет аффилированности."}
};

function getVisual(state){
  if(state.isConsequence) return { icon:ICONS.warning, file:"icon-consequence.svg", size:"96×96" };
  if(state.isProRisk || state.isConditional) return { icon:ICONS.gavel, file:"icon-personal-risk.svg", size:"96×96" };
  if(state.currentArc){
    const arc = ALL_ARCS.find(a=>a.id===state.currentArc);
    if(arc.mode==="individual") return { icon:ICONS.person, file:"persona-"+arc.id+".png", size:"512×512" };
    return { icon:ICONS.factory, file:"scene-"+arc.id+".png", size:"800×600" };
  }
  return { icon:ICONS.home, file:"scene-personal.png", size:"800×600" };
}

function newState(difficultyKey){
  const cfg = DIFFICULTY[difficultyKey] || DIFFICULTY.easy;
  let indCount, legCount;
  if(cfg.arcCount===2){ indCount=1; legCount=1; }
  else { if(Math.random()<0.5){ indCount=2; legCount=1; } else { indCount=1; legCount=2; } }
  const indArcs = pickN(ARCS_INDIVIDUAL, indCount);
  const legArcs = pickN(ARCS_LEGAL, legCount);
  const selected = [...indArcs, ...legArcs];

  const arcQueues = {}; const arcDecisions = {};
  selected.forEach(arc=>{ arcQueues[arc.id] = [...arc.cards]; arcDecisions[arc.id] = []; });

  const proRiskCount = Math.random()<0.5 ? 2 : 3;

  return {
    difficultyKey: difficultyKey || "easy",
    detail: cfg.detail,
    screen:"intro",
    counters: freshCounters(),
    selectedArcs: selected,
    arcQueues, arcDecisions,
    events: shuffle(EVENTS).slice(0,2),
    proRisk: shuffle(PROFESSIONAL_RISK).slice(0,proRiskCount),
    usedConditional: [],
    panamorovEscalation: false,
    pending: [],
    turn:0,
    currentCard:null,
    currentArc:null,
    isConsequence:false,
    isProRisk:false,
    isConditional:false,
    lastOutcome:null,
    prevCounters: freshCounters(),
    matchedCount:0,
    matchedTotal:0,
    gameOver:null,
    milestoneLine:null
  };
}

function checkBreach(counters){
  for(const k in counters){
    const v = counters[k];
    if(v<=0) return {counter:k, dir:"low"};
    if(v>=100) return {counter:k, dir:"high"};
  }
  return null;
}

function pickNextTurn(state){
  const pending = [...state.pending];
  for(let i=0;i<pending.length;i++){
    const p = pending[i];
    if(Math.random() < p.prob){
      pending.splice(i,1);
      return { type:"consequence", data:p, pending };
    }
  }
  const decayed = pending.map(p=>({...p, turns:p.turns-1})).filter(p=>p.turns>=0);

  // success-triggered events (только при высоких счётчиках, редко)
  const availableSuccess = SUCCESS_EVENTS.filter(ce =>
    !state.usedConditional.includes(ce.id) && ce.condition(state.counters)
  );
  if(availableSuccess.length>0 && Math.random()<0.15){
    return { type:"success", data:pick(availableSuccess), pending:decayed };
  }

  if(state.events.length>0 && Math.random()<0.1){
    const events=[...state.events]; const ev=events.shift();
    return { type:"event", data:ev, events, pending:decayed };
  }
  if(state.proRisk.length>0 && Math.random()<0.1){
    const proRisk=[...state.proRisk]; const pr=proRisk.shift();
    return { type:"prorisk", data:pr, proRisk, pending:decayed };
  }
  // background events (Панаморов, пресса — не зависят от счётчиков, но могут требовать флаг)
  const availableBackground = BACKGROUND_EVENTS.filter(ce =>
    !state.usedConditional.includes(ce.id) && (!ce.requires || state[ce.requires])
  );
  if(availableBackground.length>0 && Math.random()<0.1){
    return { type:"background", data:pick(availableBackground), pending:decayed };
  }

  const available = Object.keys(state.arcQueues).filter(k=>state.arcQueues[k].length>0);
  if(available.length===0) return { type:"end", pending:decayed };
  const arcKey = pick(available);
  const arcQueues = {...state.arcQueues, [arcKey]: [...state.arcQueues[arcKey]]};
  const card = arcQueues[arcKey].shift();
  return { type:"arc", arcKey, data:card, arcQueues, pending:decayed };
}

function arcOutcome(state, arcId){
  const arc = ALL_ARCS.find(a=>a.id===arcId);
  const decisions = state.arcDecisions[arcId] || [];
  const matched = decisions.filter(Boolean).length;
  const ratio = decisions.length? matched/decisions.length : 0;
  if(ratio>=0.8) return arc.outcomes.high;
  if(ratio>=0.4) return arc.outcomes.mid;
  return arc.outcomes.low;
}

function pickMilestone(counters){
  const c = counters;
  const dists = [
    {k:"time_low", v:c.time}, {k:"time_high", v:100-c.time},
    {k:"money_low", v:c.money}, {k:"money_high", v:100-c.money},
    {k:"legality_edge", v:Math.min(c.legality, 100-c.legality)},
    {k:"reputation_low", v:c.reputation}, {k:"reputation_high", v:100-c.reputation}
  ];
  dists.sort((a,b)=>a.v-b.v);
  const closest = dists[0];
  if(closest.v <= 22){
    const pool = MILESTONES[closest.k];
    return pool[Math.floor(Math.random()*pool.length)];
  }
  return MILESTONES.neutral[0];
}

function reducer(state, action){
  switch(action.type){
    case "SET_DIFFICULTY_PREVIEW":
      return { ...state, previewDifficulty: action.key };
    case "START": {
      const s = newState(action.key);
      return advance({...s, screen:"card"});
    }
    case "CHOOSE": {
      const opt = action.opt;
      const prevCounters = state.counters;
      const counters = {...prevCounters};
      for(const k in opt.effects) counters[k] = clamp(counters[k] + opt.effects[k]);

      let matchedCount = state.matchedCount, matchedTotal = state.matchedTotal;
      const arcDecisions = {...state.arcDecisions};
      if(opt.matched!==null && opt.matched!==undefined){
        if(state.currentArc && arcDecisions[state.currentArc]){
          arcDecisions[state.currentArc] = [...arcDecisions[state.currentArc], opt.matched];
        }
        matchedTotal += 1;
        if(opt.matched) matchedCount += 1;
      }
      let pending = state.pending;
      if(opt.delayed){
        const split = splitLabel(opt.label);
        pending = [...pending, {
          prob:opt.delayed.prob, turns:opt.delayed.turns, effects:opt.delayed.effects, text:opt.delayed.text,
          originTurn: state.turn, originArc: state.currentArc, originDecision: split.short
        }];
      }
      let usedConditional = state.usedConditional;
      if(state.currentConditionalId){
        usedConditional = [...usedConditional, state.currentConditionalId];
      }

      const flagUpdate = opt.setFlag ? { [opt.setFlag]: true } : {};

      const nextState = { ...state, prevCounters, counters, matchedCount, matchedTotal, arcDecisions, pending, usedConditional, lastOutcome: opt, ...flagUpdate };
      const breach = checkBreach(counters);
      if(breach) return { ...nextState, screen:"gameover", gameOver:breach };
      return { ...nextState, screen:"outcome" };
    }
    case "CONTINUE": {
      return advance(state);
    }
    case "RESTART": {
      const s = newState(state.difficultyKey);
      return advance({...s, screen:"card"});
    }
    case "BACK_TO_INTRO":
      return newState("easy");
    default:
      return state;
  }
}

function advance(state){
  let s = { ...state, turn: state.turn+1 };
  if(s.turn>1 && (s.turn-1)%5===0){
    return { ...s, screen:"milestone", milestoneLine: pickMilestone(s.counters) };
  }
  return draw(s);
}

function draw(state){
  const res = pickNextTurn(state);
  let s = { ...state };
  if(res.pending) s.pending = res.pending;
  if(res.events) s.events = res.events;
  if(res.proRisk) s.proRisk = res.proRisk;
  if(res.arcQueues) s.arcQueues = res.arcQueues;

  if(res.type==="end"){ return { ...s, screen:"final" }; }

  if(res.type==="consequence"){
    const arcLabel = res.data.originArc ? ALL_ARCS.find(a=>a.id===res.data.originArc).label : "личных дел";
    const originText = 'ORIGIN::Последствие решения «'+res.data.originDecision+'» (ход '+res.data.originTurn+', «'+arcLabel+'»)::'+res.data.text;
    return { ...s, screen:"card", currentCard:{ id:"consequence", text:originText, options:[{label:"Понятно", effects:res.data.effects, matched:null}] },
      currentArc: res.data.originArc, isConsequence:true, isProRisk:false, isConditional:false, currentConditionalId:null };
  }
  if(res.type==="success"){
    return { ...s, screen:"card", currentCard:res.data, currentArc:null,
      isConsequence:false, isProRisk:false, isConditional:true, currentConditionalId:res.data.id };
  }
  if(res.type==="background"){
    return { ...s, screen:"card", currentCard:res.data, currentArc:null,
      isConsequence:false, isProRisk:false, isConditional:false, currentConditionalId:res.data.id };
  }
  if(res.type==="event"){
    return { ...s, screen:"card", currentCard:res.data, currentArc:null, isConsequence:false, isProRisk:false, isConditional:false, currentConditionalId:null };
  }
  if(res.type==="prorisk"){
    return { ...s, screen:"card", currentCard:res.data, currentArc:null, isConsequence:false, isProRisk:true, isConditional:false, currentConditionalId:null };
  }
  return { ...s, screen:"card", currentCard:res.data, currentArc:res.arcKey, isConsequence:false, isProRisk:false, isConditional:false, currentConditionalId:null };
}

/* ============ UI ============ */

function Gauge({ k, value }){
  const [displayed, setDisplayed] = useState(value);
  const [pulsing, setPulsing] = useState(false);
  const displayedRef = useRef(value);
  const rafRef = useRef(null);
  const firstRender = useRef(true);

  useEffect(()=>{
    if(firstRender.current){ firstRender.current = false; displayedRef.current = value; return; }
    cancelAnimationFrame(rafRef.current);
    const from = displayedRef.current;
    const to = value;
    if(Math.abs(from-to)<0.01) return;
    setPulsing(true);
    const duration = 700;
    const t0 = performance.now();
    function step(now){
      const p = Math.min(1, (now-t0)/duration);
      const eased = 1-Math.pow(1-p,3);
      const v = from + (to-from)*eased;
      displayedRef.current = v;
      setDisplayed(v);
      if(p<1){ rafRef.current = requestAnimationFrame(step); }
      else { setPulsing(false); }
    }
    rafRef.current = requestAnimationFrame(step);
    return ()=>cancelAnimationFrame(rafRef.current);
  }, [value]);

  return (
    <div className={"gauge"+(pulsing?" pulse":"")}>
      <div className="gauge-label">{COUNTERS_META[k].label}</div>
      <div className="gauge-bar"><div className={"gauge-fill "+gaugeClass(displayed)} style={{width:displayed+"%"}}/></div>
      <div className="gauge-val">{Math.round(displayed)}</div>
    </div>
  );
}

function Hud({ counters, turn }){
  return (
    <>
      <div className="hud">
        {Object.keys(COUNTERS_META).map(k=><Gauge key={k} k={k} value={counters[k]}/>)}
      </div>
      <div className="turn-counter">Ход {turn}</div>
    </>
  );
}

const STATS_KEY = "upravlyayushchiy_stats_v1";

function loadStats(){
  if(typeof window==="undefined") return { gamesPlayed:0, bestPct:0, pctSum:0, statsCount:0, bestTurns:0 };
  try{
    const raw = window.localStorage.getItem(STATS_KEY);
    if(!raw) return { gamesPlayed:0, bestPct:0, pctSum:0, statsCount:0, bestTurns:0 };
    return JSON.parse(raw);
  } catch(e){ return { gamesPlayed:0, bestPct:0, pctSum:0, statsCount:0, bestTurns:0 }; }
}

function saveStats(stats){
  if(typeof window==="undefined") return;
  try{ window.localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch(e){}
}

function recordGameEnd(pct, turns){
  const stats = loadStats();
  stats.gamesPlayed += 1;
  stats.pctSum += pct;
  stats.statsCount += 1;
  if(pct > stats.bestPct) stats.bestPct = pct;
  if(turns > stats.bestTurns) stats.bestTurns = turns;
  saveStats(stats);
  return stats;
}

export default function Game(){
  const [state, dispatch] = useReducer(reducer, null, ()=>newState("easy"));
  const [explainOpen, setExplainOpen] = useReducer(x=>!x, false);
  const prevScreenRef = useRef(null);
  const recordedRef = useRef(false);
  useEffect(()=>{ if(state.screen!=="outcome") setExplainOpen(); }, [state.screen]); // reset toggle on screen change (rough)
  useEffect(()=>{
    if((state.screen==="final" || state.screen==="gameover") && !recordedRef.current){
      recordedRef.current = true;
      const pct = state.matchedTotal? Math.round(100*state.matchedCount/state.matchedTotal):0;
      recordGameEnd(pct, state.turn);
    }
    if(state.screen==="card" || state.screen==="intro"){
      recordedRef.current = false;
    }
  }, [state.screen]);

  if(state.screen==="intro") return <Intro dispatch={dispatch} state={state}/>;
  if(state.screen==="milestone") return <Milestone state={state} dispatch={dispatch}/>;
  if(state.screen==="card") return <CardScreen state={state} dispatch={dispatch}/>;
  if(state.screen==="outcome") return <OutcomeScreen state={state} dispatch={dispatch}/>;
  if(state.screen==="gameover") return <GameOverScreen state={state} dispatch={dispatch}/>;
  if(state.screen==="final") return <FinalScreen state={state} dispatch={dispatch}/>;
  return null;
}

function Intro({ dispatch, state }){
  const key = state.previewDifficulty || "easy";
  const cfg = DIFFICULTY[key];
  const [stats, setStats] = useState(null);
  useEffect(()=>{ setStats(loadStats()); }, []);
  return (
    <div className="app">
      <div className="eyebrow">Карточная игра · v0.4 (Next.js)</div>
      <h1 className="title">Управляющий</h1>
      <div className="subtitle">Вы — арбитражный управляющий. У вас есть время, деньги, репутация и совесть. Постарайтесь не потерять всё четыре одновременно.</div>
      {stats && stats.gamesPlayed>0 &&
        <div className="final-stats" style={{marginBottom:"18px"}}>
          <div>Партий сыграно: {stats.gamesPlayed}</div>
          <div>Лучший результат: {stats.bestPct}%</div>
        </div>
      }
      <div className="intro-card">
        <div className="gauge-label">Уровень сложности</div>
        <div className="diff-row">
          {Object.keys(DIFFICULTY).map(k=>(
            <button key={k} className={"diff-btn"+(key===k?" active":"")}
              onClick={()=>dispatch({type:"SET_DIFFICULTY_PREVIEW", key:k})}>{DIFFICULTY[k].label}</button>
          ))}
        </div>
        <div className="diff-hint">{cfg.hint}</div>
        <div className="intro-rules" dangerouslySetInnerHTML={{__html:
          "→ <b>Время / Деньги / Законность / Репутация</b> — четыре шкалы, 0–100.<br>"+
          "→ Выход любой шкалы за край — немедленный game over.<br>"+
          "→ Дела выбираются случайно из общего пула физлиц и юрлиц.<br>"+
          "→ Помимо дел — случаи, где под вопросом ваша собственная работа.<br>"+
          "→ Некоторые решения аукаются не сразу.<br>"+
          "→ После выбора можно нажать «Объяснить» — покажет реальную позицию ВС РФ с реквизитами дела."
        }}/>
        <button className="btn btn-primary" onClick={()=>dispatch({type:"START", key})}>Начать смену</button>
      </div>
      <div className="footer-note">ПРОТОТИП · NEXT.JS</div>
    </div>
  );
}

function Milestone({ state, dispatch }){
  return (
    <div className="app">
      <Hud counters={state.counters} turn={state.turn}/>
      <div className="milestone">
        <div className="milestone-line">«{state.milestoneLine}»</div>
        <button className="btn btn-primary" onClick={()=>dispatch({type:"CONTINUE"})}>Продолжить</button>
      </div>
    </div>
  );
}

function CardVisual({ visual }){
  const [failed, setFailed] = useState(false);
  useEffect(()=>{ setFailed(false); }, [visual.file]);
  if(failed){
    return (
      <div className="card-visual">
        <div dangerouslySetInnerHTML={{__html: visual.icon}} />
        <div className="card-visual-label">[ЗАГЛУШКА] {visual.file} · {visual.size}</div>
      </div>
    );
  }
  return (
    <div className="card-visual card-visual-img">
      <img src={"/images/"+visual.file} alt="" onError={()=>setFailed(true)} />
    </div>
  );
}

function CardScreen({ state, dispatch }){
  const c = state.currentCard;
  const visual = getVisual(state);
  let tag = "СЛУЧАЙ";
  if(state.isConsequence) tag = "ПОСЛЕДСТВИЯ";
  else if(state.isProRisk) tag = "ЛИЧНЫЙ РИСК";
  else if(state.isConditional) tag = "ПОСЛЕДСТВИЯ УСПЕХА";
  else if(state.currentArc) tag = (ALL_ARCS.find(a=>a.id===state.currentArc)||{}).label || "СЛУЧАЙ";

  let bodyText = c.text;
  let originLine = null;
  if(bodyText.startsWith("ORIGIN::")){
    const parts = bodyText.split("::");
    originLine = parts[1];
    bodyText = parts[2];
  }

  return (
    <div className="app">
      <Hud counters={state.counters} turn={state.turn}/>
      <div className="card">
        <CardVisual visual={visual}/>
        <div className="card-tag">{tag.toUpperCase()}</div>
        <div className="card-text">
          {originLine && <span className="consequence-origin">{originLine}</span>}
          {bodyText}
        </div>
        <div className="options">
          {c.options.map((opt,idx)=>{
            const split = splitLabel(opt.label);
            const shown = state.detail==="full" ? split.full : split.short;
            return (
              <button key={idx} className="option-btn" onClick={()=>dispatch({type:"CHOOSE", opt})}>
                <span className="option-letter">{String.fromCharCode(65+idx)}</span>{shown}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OutcomeScreen({ state, dispatch }){
  const opt = state.lastOutcome;
  return <OutcomeInner state={state} dispatch={dispatch} opt={opt} nextAction={{type:"CONTINUE"}}/>;
}

function OutcomeInner({ state, dispatch, opt, nextAction }){
  const [open, toggle] = useReducer(x=>!x, false);
  return (
    <div className="app">
      <Hud counters={state.counters} turn={state.turn}/>
      <div className="outcome">
        {opt.matched===true && <div className="stamp match">КАК У ВС РФ</div>}
        <div className="outcome-text">Решение принято.</div>
        <div className="deltas">
          {Object.keys(opt.effects).map(k=>{
            const v = opt.effects[k];
            return <div key={k} className={"delta "+(v>=0?"pos":"neg")}>{COUNTERS_META[k].label} {v>=0?"+":""}{v}</div>;
          })}
        </div>
        <div className="outcome-actions">
          {opt.explanation && <button className="btn btn-explain" onClick={toggle}>Объяснить</button>}
          <button className="btn btn-outcome" onClick={()=>dispatch(nextAction)}>Продолжить</button>
        </div>
        {opt.explanation && <div className={"explain-box"+(open?" open":"")}><b>Как на самом деле:</b> {opt.explanation}</div>}
      </div>
    </div>
  );
}

function GameOverScreen({ state, dispatch }){
  const key = state.gameOver.counter+"_"+state.gameOver.dir;
  const info = BREACH_TEXT[key];
  const pct = state.matchedTotal? Math.round(100*state.matchedCount/state.matchedTotal):0;
  return (
    <div className="app">
      <Hud counters={state.counters} turn={state.turn}/>
      <div className="final-block">
        <div className="gameover-title">{info.title}</div>
        <div className="final-arc-desc">{info.desc}</div>
      </div>
      <div className="final-stats">
        <div>Продержались: {state.turn} ходов</div>
        <div>Совпадение с практикой ВС: {pct}%</div>
      </div>
      <button className="btn btn-primary" onClick={()=>dispatch({type:"RESTART"})}>Начать заново</button>
    </div>
  );
}

function ShareButton({ text }){
  const [status, setStatus] = useState("idle");
  async function onShare(){
    if(navigator.share){
      try{
        await navigator.share({ text, title:"Управляющий" });
        return;
      } catch(e){
        // пользователь отменил или API недоступен по факту — тихо переходим к копированию
      }
    }
    try{
      await navigator.clipboard.writeText(text);
      setStatus("copied");
      setTimeout(()=>setStatus("idle"), 2000);
    } catch(e){
      setStatus("error");
      setTimeout(()=>setStatus("idle"), 2000);
    }
  }
  return (
    <button className="btn btn-outcome" onClick={onShare} style={{width:"100%", marginBottom:"14px"}}>
      {status==="copied" ? "Скопировано ✓" : status==="error" ? "Не получилось скопировать" : "Поделиться результатом"}
    </button>
  );
}

function FinalScreen({ state, dispatch }){
  const pct = state.matchedTotal? Math.round(100*state.matchedCount/state.matchedTotal):0;
  const outcomes = state.selectedArcs.map(a=>arcOutcome(state, a.id));
  const shareText = "УПРАВЛЯЮЩИЙ\n\n"+state.selectedArcs.map((a,i)=>a.label+": "+outcomes[i].title).join("\n")+"\nСовпадение с практикой ВС РФ: "+pct+"%\n\nА вы продержитесь дольше? poluianov.ru";
  return (
    <div className="app">
      <div className="eyebrow">Итоги смены</div>
      <h1 className="title">Готово.</h1>
      {state.selectedArcs.map((arc,i)=>(
        <div className="final-block" key={arc.id}>
          <div className="final-arc-title">{arc.label}</div>
          <div className="final-arc-outcome">{outcomes[i].title}</div>
          <div className="final-arc-desc">{outcomes[i].desc}</div>
        </div>
      ))}
      <div className="final-stats">
        <div>Ходов: {state.turn}</div>
        <div>Совпадение с практикой ВС: {pct}%</div>
      </div>
      <div className="share-preview">{shareText.split("\n").map((line,i)=><div key={i}>{line}&nbsp;</div>)}</div>
      <ShareButton text={shareText}/>
      <button className="btn btn-primary" onClick={()=>dispatch({type:"RESTART"})}>Играть снова</button>
      <div className="footer-note">ПРОТОТИП · NEXT.JS</div>
    </div>
  );
}
