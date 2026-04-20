'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Camera, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

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
    'bg-amber-400',
    'bg-green-400',
    'bg-blue-400',
    'bg-purple-400',
    'bg-pink-400',
    'bg-indigo-400',
  ];
  const randomColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];

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
          className="text-center mb-8"
        >
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Set Up Your Profile</h1>
          <p className="text-gray-500">Tell us a bit about yourself</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="flex justify-center mb-8"
        >
          <div className="relative">
            <div className={`w-24 h-24 ${randomColor} rounded-full flex items-center justify-center`}>
              {name ? (
                <span className="text-3xl font-bold text-white">{name[0].toUpperCase()}</span>
              ) : (
                <User className="w-10 h-10 text-white/80" />
              )}
            </div>
            <button className="absolute bottom-0 right-0 w-10 h-10 bg-primary rounded-full flex items-center justify-center shadow-lg hover:bg-primary-dark transition-colors">
              <Camera className="w-5 h-5 text-white" />
            </button>
          </div>
        </motion.div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError('');
              }}
              leftIcon={<User size={20} className="text-gray-400" />}
              error={error && !name ? error : undefined}
              autoFocus
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <Input
              type="email"
              placeholder="Email (optional)"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              leftIcon={<Mail size={20} className="text-gray-400" />}
              error={error && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? error : undefined}
            />
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-xs text-gray-400 text-center"
          >
            Phone: {phone}
          </motion.p>

          {error && name && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-red-500 text-center"
            >
              {error}
            </motion.p>
          )}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
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
                  Continue
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </Button>
          </motion.div>

          {onSkip && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              type="button"
              onClick={onSkip}
              className="w-full text-center text-gray-400 text-sm hover:text-gray-600 transition-colors py-2"
            >
              Skip for now
            </motion.button>
          )}
        </form>
      </div>
    </motion.div>
  );
}