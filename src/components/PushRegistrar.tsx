import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { initPush } from '@/lib/push';

/** App iOS/Android: liga as notificações depois do login. No navegador não faz nada. */
export function PushRegistrar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (user) void initPush((url) => navigate(url)).catch((e) => console.warn('push', e));
  }, [user, navigate]);
  return null;
}
