/** Optional position access must not discard authorized identity options. */
export async function loadEmployeeReferenceOptions<Directory,Positions>(readDirectory:()=>Promise<Directory>,readPositions?:()=>Promise<Positions>){
 const [directory,positions]=await Promise.allSettled([readDirectory(),readPositions?.()] as const);
 return {directory,positions};
}
