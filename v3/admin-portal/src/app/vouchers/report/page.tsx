"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function VoucherReportPage() {
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get<{items:any[]}>("/admin/vouchers?per_page=100").then(d => setVouchers(Array.isArray(d) ? d : (d.items||[]))).catch((e)=>{console.error('vouchers:',e)}).finally(() => setLoading(false));
  }, []);
  const totalUsed = vouchers.reduce((s:number,v:any) => s + (v.global_use_count||0), 0);
  return (
    <div style={{padding:32}}>
      <h1 className="page-title">Voucher Report</h1>
      <p className="page-subtitle" style={{marginBottom:24}}>{vouchers.length} vouchers · {totalUsed} total redemptions</p>
      {loading ? <p>Loading...</p> : (
        <div className="table-container"><table className="data-table"><thead><tr><th>Voucher</th><th>Type</th><th>Discount</th><th>Used</th><th>Max</th><th>Usage %</th><th>Status</th></tr></thead><tbody>
          {vouchers.map((v:any) => (
            <tr key={v.id}>
              <td><div style={{fontWeight:600}}>{v.display_title}</div><div style={{fontSize:11,color:"var(--color-text-muted)"}}>{v.voucher_code}</div></td>
              <td>{v.voucher_type}</td>
              <td>{v.voucher_type==="percentage_off" ? Math.round(v.discount_value) : v.discount_value}{v.voucher_type==="percentage_off"?"%":v.voucher_type==="fixed_amount_off"?" RM":""}</td>
              <td>{v.global_use_count||0}</td>
              <td>{v.max_global_uses||"∞"}</td>
              <td><div style={{width:100,height:6,borderRadius:3,background:"var(--color-bg-muted)"}}><div style={{width:`${v.max_global_uses?Math.min(100,(v.global_use_count||0)/v.max_global_uses*100):0}%`,height:"100%",borderRadius:3,background:(v.global_use_count||0)>0?"var(--color-primary)":"var(--color-border-light)"}}/></div></td>
              <td><span className={`badge badge-sm ${v.is_active?"badge-green":"badge-gray"}`}>{v.is_active?"Active":"Inactive"}</span></td>
            </tr>
          ))}
        </tbody></table></div>
      )}
    </div>
  );
}
