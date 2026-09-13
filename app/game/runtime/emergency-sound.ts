/** Original deterministic non-language effects. No recording, TTS or network. */
export function emergencySound(id:string,sr=22050):Float32Array|null {
  const duration:Record<string,number>={'fire-alarm':1.9,heartbeat:.65,'nonverbal-cough':1.4,'telephone-connect':1.45,'rescue-arrival':3.2,'exit-door-latch':.78};
  if(!duration[id])return null;
  const seconds=duration[id],data=new Float32Array(Math.ceil(seconds*sr));let seed=712921,low=0,phase=0;
  const noise=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/2147483648-1;};
  for(let i=0;i<data.length;i++){
    const t=i/sr,n=noise();low=.7*low+.3*n;let v=0;
    if(id==='fire-alarm'){
      const cycle=t%.6,env=Math.min(1,cycle/.018)*Math.min(1,(.39-cycle)/.035);
      if(cycle<.39)v=(Math.sin(t*2*Math.PI*920)+.25*Math.sin(t*2*Math.PI*1840))*.32*Math.max(0,env);
    }else if(id==='exit-door-latch'){
      for(const start of [0,.15]){const q=t-start;if(q>=0&&q<.13)v+=low*.65*Math.exp(-q*24)*Math.min(1,q/.01);}
      const q=t-.36;if(q>=0&&q<.3)v+=(low*.48+Math.sin(q*2*Math.PI*130)*.24)*Math.exp(-q*17)*Math.min(1,q/.009);
      const latch=t-.51;if(latch>=0&&latch<.09)v+=n*.22*Math.exp(-latch*55);
    }else if(id==='heartbeat'){
      for(const start of [0,.19]){const q=t-start;if(q>=0)v+=Math.sin(2*Math.PI*(62*q-22*q*q))*Math.exp(-q*23)*.7;}
    }else if(id==='nonverbal-cough'){
      for(const start of [.06,.5,.92]){const q=t-start;if(q>=0&&q<.3){const env=Math.sin(Math.PI*q/.3)*Math.exp(-q*4);v+=(low*.85+(Math.sin(t*2*Math.PI*173)+Math.sin(t*2*Math.PI*810)*.35)*.1)*env;}}
    }else if(id==='telephone-connect'){
      if(t<.7){const key=Math.min(2,Math.floor(t/.22)),q=t%.22;if(q<.16)v=(Math.sin(t*2*Math.PI*[697,697,852][key])+Math.sin(t*2*Math.PI*[1209,1209,1477][key]))*.18*Math.sin(Math.PI*q/.16);}
      else if(t>1.02&&t<1.38)v=Math.sin(t*2*Math.PI*660)*.22*Math.sin(Math.PI*(t-1.02)/.36);
    }else if(id==='rescue-arrival'){
      const f=520+230*(.5+.5*Math.sin(t*2*Math.PI/.95));phase+=2*Math.PI*f/sr;
      v=(Math.sin(phase)+Math.sin(phase*2)*.18)*.32*Math.min(1,t/.55)*Math.min(1,(seconds-t)/.7);
    }
    data[i]=v*Math.min(1,t/.012)*Math.min(1,(seconds-t)/.02);
  }
  const mean=data.reduce((a,b)=>a+b,0)/data.length;
  for(let i=0;i<data.length;i++)data[i]=Math.max(-.72,Math.min(.72,data[i]-mean));
  return data;
}
