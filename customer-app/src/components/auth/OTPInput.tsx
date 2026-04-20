'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, ChevronLeft, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';

interface OTPInputProps {
  phone: string;
  onSubmit: (otp: string) => Promise<void>;
  onResend: () => Promise<void>;
  onBack: () => void;
}

export function OTPInput({ phone, onSubmit, onResend, onBack }: OTPInputProps) {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setError('');

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newOtp.every((digit) => digit !== '')) {
      handleVerify(newOtp.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6);
    if (!/^\d+$/.test(pastedData)) return;
    
    const newOtp = [...otp];
    pastedData.split('').forEach((char, i) => {
      if (i < 6) newOtp[i] = char;
    });
    setOtp(newOtp);
    
    const lastFilledIndex = Math.min(pastedData.length - 1, 5);
    inputRefs.current[lastFilledIndex]?.focus();
  };

  const handleVerify = async (code?: string) => {
    const otpCode = code || otp.join('');
    if (otpCode.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await onSubmit(otpCode);
    } catch {
      setError('Invalid OTP. Please try again.');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    setIsLoading(true);
    try {
      await onResend();
      setResendTimer(60);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch {
      setError('Failed to resend OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Format phone for display
  const displayPhone = phone.replace(/(\+\d{2})(\d{2})(\d{3})(\d{4})/, '$1 $2 $3 $4');

  return (
    <div className="w-full">
      {/* Back Button */}
      <motion.button
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={onBack}
        className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors mb-6"
      >
        <ChevronLeft className="w-6 h-6 text-white" />
      </motion.button>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-center mb-10"
      >
        <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <ShieldCheck className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Verify Phone</h1>
        <p className="text-white/70">
          Enter the 6-digit code sent to<br />
          <span className="font-semibold text-white">{displayPhone}</span>
        </p>
      </motion.div>

      {/* OTP Input */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex justify-center gap-2 mb-6"
        onPaste={handlePaste}
      >
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={(el) => { inputRefs.current[index] = el; }}
            type="text"
            inputMode="numeric"
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            className={`
              w-12 h-14 text-center text-2xl font-bold rounded-xl border-2 transition-all duration-200
              ${error 
                ? 'border-red-400 bg-red-500/10 text-red-300' 
                : digit 
                  ? 'border-white/50 bg-white/15 text-white' 
                  : 'border-white/20 bg-white/10 text-white focus:border-white/40'
              }
              outline-none
            `}
            maxLength={1}
          />
        ))}
      </motion.div>

      {/* Error Message */}
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-sm text-red-300 mb-4"
        >
          {error}
        </motion.p>
      )}

      {/* Verify Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Button
          onClick={() => handleVerify()}
          className="w-full mt-4"
          size="lg"
          disabled={isLoading || otp.some((d) => !d)}
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            'Verify'
          )}
        </Button>
      </motion.div>

      {/* Resend */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-center mt-8"
      >
        <p className="text-white/50 text-sm">
          Didn&apos;t receive the code?{' '}
          <button
            onClick={handleResend}
            disabled={resendTimer > 0}
            className={`font-medium transition-colors ${
              resendTimer > 0 
                ? 'text-white/30 cursor-not-allowed' 
                : 'text-white hover:text-white/80'
            }`}
          >
            {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend'}
          </button>
        </p>
      </motion.div>

      {/* Demo Note */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-center text-xs text-white/30 mt-6"
      >
        Demo: Use code 111111
      </motion.p>
    </div>
  );
}
