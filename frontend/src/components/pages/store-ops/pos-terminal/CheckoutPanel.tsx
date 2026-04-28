'use client';

interface CheckoutPanelProps {
  result: { success: boolean; message: string } | null;
}

export default function CheckoutPanel({ result }: CheckoutPanelProps) {
  return (
    <>
      {result && (
        <div
          className={`card ptp-result ${result.success ? 'ptp-result-success' : 'ptp-result-error'}`}
        >
          <div className="ptp-55">
            <i className={`fas ${result.success ? 'fa-check-circle' : 'fa-exclamation-circle'} ptp-icon ${result.success ? 'ptp-icon-success' : 'ptp-icon-error'}`}></i>
            <div>
              <div className={`ptp-title ${result.success ? 'ptp-title-success' : 'ptp-title-error'}`}>{result.success ? 'Success' : 'Error'}</div>
              <div className={`ptp-msg ${result.success ? 'ptp-msg-success' : 'ptp-msg-error'}`}>{result.message}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
