import {useCallback,useEffect,useRef,useState} from "react";
import {hrLoadErrorMessage} from "./hr-errors";
export function useHrResource<T>(enabled:boolean,read:(signal:AbortSignal)=>Promise<T>,failureMessage="读取业务信息失败"){
 const [data,setData]=useState<T|null>(null),[loading,setLoading]=useState(enabled),[error,setError]=useState("");
 const request=useRef<AbortController|null>(null),generation=useRef(0),alive=useRef(true);
 const load=useCallback(async()=>{if(!enabled||!alive.current)return true;request.current?.abort();const controller=new AbortController(),owner=++generation.current;request.current=controller;setData(null);setError("");setLoading(true);try{const next=await read(controller.signal);if(!alive.current||controller.signal.aborted||owner!==generation.current)return false;setData(next);return true;}catch(e){if(alive.current&&!controller.signal.aborted&&owner===generation.current)setError(hrLoadErrorMessage(e,failureMessage));return false;}finally{if(alive.current&&owner===generation.current)setLoading(false);}},[enabled,read,failureMessage]);
 useEffect(()=>{alive.current=true;void load();return()=>{generation.current++;request.current?.abort();};},[load]);useEffect(()=>()=>{alive.current=false;},[]);
 return {data,loading,error,load};
}
