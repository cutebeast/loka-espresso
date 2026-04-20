'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';

interface PhoneInputProps {
  onSubmit: (phone: string) => Promise<void>;
  onNavigateToRegister?: () => void;
}

export function PhoneInput({ onSubmit, onNavigateToRegister }: PhoneInputProps) {
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const formatPhone = (value: string) => {
    // Remove non-digits
    const digits = value.replace(/\D/g, '');
    
    // Format as Malaysian number
    if (digits.startsWith('60')) {
      if (digits.length <= 2) return '+' + digits;
      if (digits.length <= 4) return '+' + digits.slice(0, 2) + ' ' + digits.slice(2);
      if (digits.length <= 7) return '+' + digits.slice(0, 2) + ' ' + digits.slice(2, 4) + ' ' + digits.slice(4);
      return '+' + digits.slice(0, 2) + ' ' + digits.slice(2, 4) + ' ' + digits.slice(4, 7) + ' ' + digits.slice(7, 11);
    }
    
    if (digits.startsWith('0')) {
      if (digits.length <= 3) return digits;
      if (digits.length <= 6) return digits.slice(0, 3) + ' ' + digits.slice(3);
      if (digits.length <= 8) return digits.slice(0, 3) + ' ' + digits.slice(3, 6) + ' ' + digits.slice(6);
      return digits.slice(0, 3) + ' ' + digits.slice(3, 6) + ' ' + digits.slice(6, 9) + ' ' + digits.slice(9, 11);
    }
    
    return digits;
  };

  const normalizePhone = (value: string): string => {
    const digits = value.replace(/\D/g, '');
    if (digits.startsWith('0')) {
      return '+6' + digits;
    }
    if (digits.startsWith('60')) {
      return '+' + digits;
    }
    return '+60' + digits;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setPhone(formatted);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const digits = phone.replace(/\D/g, '');
    
    if (!digits || digits.length < 10) {
      setError('Please enter a valid phone number');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      const normalized = normalizePhone(phone);
      await onSubmit(normalized);
    } catch {
      setError('Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-center mb-10"
      >
        <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Phone className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Welcome to Loka</h1>
        <p className="text-white/70">Enter your phone number to get started</p>
      </motion.div>

      {/* Form */}
      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        {/* Phone Input */}
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60 font-medium">
            +60
          </div>
          <input
            type="tel"
            value={phone.replace('+60 ', '').replace('+60', '')}
            onChange={handleChange}
            placeholder="12 345 6789"
            autoFocus
            className={`
              w-full bg-white/10 border-2 rounded-2xl py-4 pl-14 pr-4 text-white text-lg
              placeholder:text-white/40 transition-all duration-200
              ${error 
                ? 'border-red-400 bg-red-500/10' 
                : 'border-white/20 focus:border-white/50 focus:bg-white/15'
              }
            `}
          />
          <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
        </div>

        {/* Error Message */}
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-red-300 text-sm text-center"
          >
            {error}
          </motion.p>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full mt-6"
          size="lg"
          disabled={isLoading || phone.length < 10}
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              Continue
              <ChevronRight className="w-5 h-5" />
            </>
          )}
        </Button>
      </motion.form>

      {/* Terms */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-center text-sm text-white/50 mt-8 leading-relaxed"
      >
        By continuing, you agree to our{' '}
        <button className="text-white/70 underline hover:text-white transition-colors">
          Terms of Service
        </button>{' '}
        and{' '}
        <button className="text-white/70 underline hover:text-white transition-colors">
          Privacy Policy
        </button>
      </motion.p>
    </div>
  );
}
