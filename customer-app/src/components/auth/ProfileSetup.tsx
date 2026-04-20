'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Camera, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';

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
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
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

  const avatarColors = [
    'bg-accent-copper',
    'bg-accent',
    'bg-accent-blue',
    'bg-accent-brown',
  ];
  const randomColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];
  const displayPhone = phone.replace(/(\+\d{2})(\d{2})(\d{3})(\d{4})/, '$1 $2 $3 $4');

  return (
    <div className="w-full">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-center mb-8"
      >
        <h1 className="text-3xl font-bold text-white mb-3">Create Profile</h1>
        <p className="text-white/70">Tell us a bit about yourself</p>
      </motion.div>

      {/* Avatar */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15 }}
        className="flex justify-center mb-8"
      >
        <div className="relative">
          <div className={`w-24 h-24 ${randomColor} rounded-full flex items-center justify-center shadow-lg`}>
            {name ? (
              <span className="text-3xl font-bold text-white">{name[0].toUpperCase()}</span>
            ) : (
              <User className="w-10 h-10 text-white/80" />
            )}
          </div>
          <button className="absolute bottom-0 right-0 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-100 transition-colors">
            <Camera className="w-5 h-5 text-primary" />
          </button>
        </div>
      </motion.div>

      {/* Form */}
      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        {/* Name Input */}
        <div className="relative">
          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            autoFocus
            className={`
              w-full bg-white/10 border-2 rounded-2xl py-4 pl-12 pr-4 text-white text-lg
              placeholder:text-white/40 transition-all duration-200
              ${error && !name
                ? 'border-red-400 bg-red-500/10' 
                : 'border-white/20 focus:border-white/50 focus:bg-white/15'
              }
            `}
          />
        </div>

        {/* Email Input */}
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
          <input
            type="email"
            placeholder="Email (optional)"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            className={`
              w-full bg-white/10 border-2 rounded-2xl py-4 pl-12 pr-4 text-white text-lg
              placeholder:text-white/40 transition-all duration-200
              ${error && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
                ? 'border-red-400 bg-red-500/10' 
                : 'border-white/20 focus:border-white/50 focus:bg-white/15'
              }
            `}
          />
        </div>

        {/* Phone Display */}
        <p className="text-center text-sm text-white/40">
          {displayPhone}
        </p>

        {/* Error */}
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center text-sm text-red-300"
          >
            {error}
          </motion.p>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full mt-6"
          size="lg"
          disabled={isLoading || !name.trim()}
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              Get Started
              <ChevronRight className="w-5 h-5" />
            </>
          )}
        </Button>

        {/* Skip */}
        {onSkip && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            type="button"
            onClick={onSkip}
            className="w-full text-center text-white/50 text-sm hover:text-white/80 transition-colors py-2"
          >
            Skip for now
          </motion.button>
        )}
      </motion.form>
    </div>
  );
}
