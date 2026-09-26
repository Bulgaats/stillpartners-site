import { describe,it,expect } from "vitest";
import { contactText,directory,effectiveRate,hoursAmountCents,validAbn,validDate,type Contractor,type OfficeRate } from "../lib/office/foundation";
const person:Contractor={id:"p",fullName:"Example Contractor",phone:"0400000000",email:"example@example.test",abn:"51824753556",group:"regular",active:true};
const rate=(overrides:Partial<OfficeRate>):OfficeRate=>({id:"r",workerId:"p",clientId:null,kind:"contractor",hourlyRateCents:7000,effectiveFrom:"2026-01-01",agreementNote:"Confirmed agreement",voidedAt:null,...overrides});
describe("Office foundation",()=>{
  it("copies all contact fields and places regular contractors first without losing occasional contacts",()=>{
    expect(contactText(person)).toBe("Full Name: Example Contractor\nPhone: 0400000000\nEmail: example@example.test");
    const occasional={...person,id:"o",fullName:"AAA",group:"occasional" as const};
    const archived={...person,id:"a",active:false};
    expect(directory([archived,occasional,person]).map(p=>p.id)).toEqual(["p","o","a"]);
    expect(directory([occasional,person],"AAA").map(p=>p.id)).toEqual(["o"]);
  });
  it("uses rates effective on the work day and prefers a client exception",()=>{
    const rates=[rate({id:"base"}),rate({id:"rise",hourlyRateCents:7200,effectiveFrom:"2026-09-21"}),rate({id:"westcon",clientId:"westcon",hourlyRateCents:7500,effectiveFrom:"2026-09-01"}),rate({id:"future",clientId:"westcon",hourlyRateCents:8000,effectiveFrom:"2026-10-01"})];
    expect(effectiveRate(rates,"p","brandon","contractor","2026-09-20")?.hourlyRateCents).toBe(7000);
    expect(effectiveRate(rates,"p","brandon","contractor","2026-09-21")?.hourlyRateCents).toBe(7200);
    expect(effectiveRate(rates,"p","westcon","contractor","2026-09-25")?.hourlyRateCents).toBe(7500);
    expect(effectiveRate(rates,"p","westcon","client","2026-09-25")).toBeNull();
    expect(effectiveRate(rates,"other","westcon","contractor","2026-09-25")).toBeNull();
    expect(effectiveRate([rate({voidedAt:"2026-09-25"})],"p","brandon","contractor","2026-09-25")).toBeNull();
  });
  it("keeps 8 paid hours and 10 billed hours independent with AUD cent precision",()=>{
    expect(hoursAmountCents(8,7000)).toBe(56000);expect(hoursAmountCents(10,8000)).toBe(80000);
    expect(hoursAmountCents(7.25,6517)).toBe(47248);
    for(const invalid of [NaN,Infinity,-1,24.01,1.001])expect(()=>hoursAmountCents(invalid,7000)).toThrow();
  });
  it("rejects invalid calendar dates and ABNs",()=>{
    expect(validDate("2026-02-30")).toBe(false);expect(validDate("2026-09-25")).toBe(true);
    expect(validAbn("51 824 753 556")).toBe(true);expect(validAbn("51824753557")).toBe(false);
  });
});
