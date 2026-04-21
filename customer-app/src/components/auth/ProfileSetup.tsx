'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Camera, Loader2 } from 'lucide-react';

interface ProfileSetupProps {
  phone: string;
  onSubmit: (data: { name: string; email?: string }) => Promise<void>;
  onSkip?: () => void;
}

export function ProfileSetup({ phone, onSubmit, onSkip }: ProfileSetupProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await onSubmit({ name: name.trim(), email: email.trim() || undefined });
    } catch {
      setError('Failed to create profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const displayPhone = phone.replace(/(\+\d{2})(\d{2})(\d{3,4})(\d{0,4})/, '$1 $2 $3 $4').trim();

  return (
    <div className="flex flex-col h-full px-6 pt-12 pb-8 bg-white">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-8"
      >
        <h2 className="text-[28px] font-bold" style={{ color: '#1B2023' }}>Complete profile</h2>
        <p className="mt-2 text-[15px]" style={{ color: '#6A7A8A' }}>
          Tell us a bit about yourself
        </p>
      </motion.div>

      {/* Avatar */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15 }}
        className="flex justify-center mb-8"
      >
        <div className="relative">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center"
            style={{ background: '#384B16' }}
          >
            {name ? (
              <span className="text-3xl font-bold text-white">{name[0].toUpperCase()}</span>
            ) : (
              <User className="w-10 h-10 text-white/70" />
            )}
          </div>
          <button
            className="absolute bottom-0 right-0 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg border border-[#D4DCE5]"
          >
            <Camera className="w-5 h-5" style={{ color: '#384B16' }} />
          </button>
        </div>
      </motion.div>

      {/* Form */}
      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        onSubmit={handleSubmit}
      >
        {/* Name Input */}
        <div className="mb-5">
          <label className="block font-semibold text-sm mb-1.5" style={{ color: '#1B2023' }}>
            Name
          </label>
          <div
            className="flex items-center rounded-2xl px-4 py-1 border-[1.5px]"
            style={{ borderColor: error && !name ? '#C75050' : '#C4CED8' }}
          >
            <User size={18} style={{ color: '#6A7A8A' }} className="mr-2" />
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              autoFocus
              className="border-none py-4 text-base w-full outline-none text-[#1B2023] placeholder:text-[#6A7A8A]/50"
            />
          </div>
        </div>

        {/* Email Input */}
        <div className="mb-5">
          <label className="block font-semibold text-sm mb-1.5" style={{ color: '#1B2023' }}>
            Email <span className="font-normal" style={{ color: '#6A7A8A' }}>(optional)</span>
          </label>
          <div className="flex items-center rounded-2xl px-4 py-1 border-[1.5px]" style={{ borderColor: '#C4CED8' }}>
            <Mail size={18} style={{ color: '#6A7A8A' }} className="mr-2" />
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              className="border-none py-4 text-base w-full outline-none text-[#1B2023] placeholder:text-[#6A7A8A]/50"
            />
          </div>
        </div>

        {/* Phone display */}
        <p className="text-center text-sm mb-4" style={{ color: '#6A7A8A' }}>
          {displayPhone}
        </p>

        {/* Error */}
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[#C75050] text-sm mb-3"
          >
            {error}
          </motion.p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading || !name.trim()}
          className="w-full font-semibold text-base py-4 rounded-full text-white disabled:opacity-40"
          style={{ background: '#384B16' }}
        >
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Get Started'}
        </button>

        {/* Skip */}
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="w-full text-center text-sm font-medium py-3 mt-2"
            style={{ color: '#6A7A8A' }}
          >
            Skip for now
          </button>
        )}
      </motion.form>
    </div>
  );
}
