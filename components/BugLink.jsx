"use client";
import { useState } from "react";

const BUG_EMAIL = "vladimir@poluianov.ru";
const TELEGRAM_URL = "https://t.me/poluianov_ru";

export default function BugLink(){
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyEmail(){
    try{
      await navigator.clipboard.writeText(BUG_EMAIL);
      setCopied(true);
      setTimeout(()=>setCopied(false), 2000);
    } catch(e){ /* ignore */ }
  }

  return (
    <>
      <a className="bug-link" href="#" onClick={(e)=>{ e.preventDefault(); setOpen(true); }}>
        Нашли ошибку? Напишите!
      </a>
      {open && (
        <div className="modal-overlay" onClick={()=>setOpen(false)}>
          <div className="modal-box" onClick={(e)=>e.stopPropagation()}>
            <div className="modal-title">Нашли ошибку?</div>
            <div className="modal-text">Напишите на почту или в Telegram — разберёмся.</div>
            <div className="modal-row">
              <span className="modal-email">{BUG_EMAIL}</span>
              <button className="btn btn-explain" onClick={copyEmail}>{copied ? "Скопировано ✓" : "Скопировать"}</button>
            </div>
            <a className="btn btn-outcome" style={{display:"block", textAlign:"center", textDecoration:"none", marginTop:"10px"}}
              href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
              Написать в Telegram
            </a>
            <button className="btn btn-ghost" style={{width:"100%", marginTop:"10px"}} onClick={()=>setOpen(false)}>Закрыть</button>
          </div>
        </div>
      )}
    </>
  );
}
