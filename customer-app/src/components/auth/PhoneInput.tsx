'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface PhoneInputProps {
  onSubmit: (phone: string) => Promise<void>;
  onNavigateToRegister?: () => void;
}

export function PhoneInput({ onSubmit, onNavigateToRegister }: PhoneInputProps) {
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      setError('Please enter your phone number');
      return;
    }
    if (!/^\+?[0-9]{10,15}$/.test(phone.replace(/\s/g, ''))) {
      setError('Please enter a valid phone number');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await onSubmit(phone);
    } catch {
      setError('Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col min-h-full px-6 py-8"
    >
      <div className="flex-1">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center mb-10"
        >
          <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Phone className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Loka</h1>
          <p className="text-gray-500">Enter your phone number to continue</p>
        </motion.div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Input
              type="tel"
              placeholder="+60 12 345 6789"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setError('');
              }}
              leftIcon={<Phone size={20} className="text-gray-400" />}
              error={error}
              autoFocus
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Send OTP
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </Button>
          </motion.div>
        </form>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-sm text-gray-400 mt-6"
        >
          By continuing, you agree to our Terms of Service and Privacy Policy
        </motion.p>
      </div>
    </motion.div>
  );
}