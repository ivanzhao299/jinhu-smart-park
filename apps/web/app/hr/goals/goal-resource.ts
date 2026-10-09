import {useHrResource} from "../use-hr-resource";
export function useResource<T>(enabled:boolean,read:(signal:AbortSignal)=>Promise<T>){return useHrResource(enabled,read,"读取目标办理信息失败");}
