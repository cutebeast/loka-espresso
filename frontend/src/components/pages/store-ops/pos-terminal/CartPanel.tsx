'use client';

interface WalletReward {
  id: number;
  reward_id: number;
  name: string;
  redemption_code: string;
  points_spent: number | null;
  expires_at: string | null;
}

interface WalletVoucher {
  id: number;
  voucher_id: number;
  title: string;
  code: string;
  discount_type: string | null;
  discount_value: number | null;
  min_spend: number | null;
  expires_at: string | null;
}

interface WalletData {
  customer_id: number;
  customer_name: string | null;
  customer_phone: string | null;
  rewards: WalletReward[];
  vouchers: WalletVoucher[];
}

interface CartPanelProps {
  wallet: WalletData | null;
  loadingWallet: boolean;
  walletError?: string;
  processingId: string | null;
  onApplyReward: (id: number) => void;
  onApplyVoucher: (id: number) => void;
}

function formatDiscount(v: WalletVoucher): string {
  if (!v.discount_type || !v.discount_value) return '';
  if (v.discount_type === 'percent') return `${v.discount_value}% off`;
  if (v.discount_type === 'fixed') return `RM ${v.discount_value} off`;
  if (v.discount_type === 'free_item') return 'Free item';
  return '';
}

export default function CartPanel({ wallet, loadingWallet, walletError, processingId, onApplyReward, onApplyVoucher }: CartPanelProps) {
  if (loadingWallet) {
    return (
      <div className="ptp-34">
        <i className="fas fa-spinner fa-spin"></i> Loading wallet...
      </div>
    );
  }

  if (!wallet) {
    if (walletError) return <div className="ptp-34" style={{color: '#EF4444'}}><i className="fas fa-exclamation-circle"></i> {walletError}</div>;
    return null;
  }

  return (
    <>
      <div className="card ptp-35">
        <h3 className="ptp-36">
          <span className="ptp-37"><i className="fas fa-gift"></i></span>
          Available Rewards ({wallet.rewards.length})
        </h3>
        {wallet.rewards.length === 0 ? (
          <div className="ptp-38">No available rewards</div>
        ) : (
          <div className="ptp-39">
            {wallet.rewards.map(r => (
              <div key={r.id} className="pos-wallet-item ptp-40">
                <div>
                  <div className="ptp-41">{r.name}</div>
                  <div className="ptp-42">
                    Code: <code className="ptp-43">{r.redemption_code}</code>
                    {r.points_spent ? ` · ${r.points_spent} pts` : ''}
                    {r.expires_at ? ` · Expires ${new Date(r.expires_at).toLocaleDateString()}` : ''}
                  </div>
                </div>
                <button
                  className="btn btn-primary btn-sm ptp-44"
                  disabled={processingId === `reward-${r.id}`}
                  onClick={() => onApplyReward(r.id)}
                >
                  {processingId === `reward-${r.id}` ? 'Applying...' : 'Use Reward'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card ptp-45">
        <h3 className="ptp-46">
          <span className="ptp-47"><i className="fas fa-ticket"></i></span>
          Available Vouchers ({wallet.vouchers.length})
        </h3>
        {wallet.vouchers.length === 0 ? (
          <div className="ptp-48">No available vouchers</div>
        ) : (
          <div className="ptp-49">
            {wallet.vouchers.map(v => (
              <div key={v.id} className="pos-wallet-item ptp-50">
                <div>
                  <div className="ptp-51">{v.title}</div>
                  <div className="ptp-52">
                    Code: <code className="ptp-53">{v.code}</code>
                    {formatDiscount(v) ? ` · ${formatDiscount(v)}` : ''}
                    {v.min_spend ? ` · Min spend RM ${v.min_spend}` : ''}
                    {v.expires_at ? ` · Expires ${new Date(v.expires_at).toLocaleDateString()}` : ''}
                  </div>
                </div>
                <button
                  className="btn btn-primary btn-sm ptp-54"
                  disabled={processingId === `voucher-${v.id}`}
                  onClick={() => onApplyVoucher(v.id)}
                >
                  {processingId === `voucher-${v.id}` ? 'Applying...' : 'Use Voucher'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
