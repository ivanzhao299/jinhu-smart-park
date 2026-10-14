"use client";
import { useCallback,useRef,useState } from "react";
import { AlertTriangle,X } from "lucide-react";
import styles from "./ApartmentWorkbench.module.css";

const TOAST_DURATION_MS = 6000;
const MAX_VISIBLE_TOASTS = 3;

export type ApartmentToast = { id: number; text: string };

export function useApartmentToasts() {
  const [toasts,setToasts] = useState<ApartmentToast[]>([]);
  const sequence = useRef(0);
  const dismissToast = useCallback((id:number)=>setToasts(list=>list.filter(toast=>toast.id!==id)),[]);
  const pushToast = useCallback((text:string)=>{
    const id = ++sequence.current;
    setToasts(list=>[...list.slice(-(MAX_VISIBLE_TOASTS-1)),{id,text}]);
    setTimeout(()=>dismissToast(id),TOAST_DURATION_MS);
  },[dismissToast]);
  return { toasts, dismissToast, pushToast };
}

export function ApartmentToastStack({toasts,onDismiss}:{toasts:ApartmentToast[];onDismiss:(id:number)=>void}){
  if(!toasts.length)return null;
  return <div className={styles.toastStack} aria-live="polite">
    {toasts.map(toast=><div className={styles.toast} role="alert" key={toast.id}>
      <AlertTriangle size={16} aria-hidden/>
      <span>{toast.text}</span>
      <button type="button" className={styles.toastClose} onClick={()=>onDismiss(toast.id)} aria-label="关闭提示"><X size={14} aria-hidden/></button>
    </div>)}
  </div>;
}
