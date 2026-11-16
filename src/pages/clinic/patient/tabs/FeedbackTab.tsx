import { Card, CardContent } from '@/components/ui/card';
import {
  MessageSquare, Star
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import type { Database } from '@/integrations/supabase/types';




type FeedbackRow = Database['public']['Tables']['session_feedback']['Row'] & {
  session_records?: { performed_at?: string | null; treatments?: { name?: string | null } | null } | null;
};

import type { PatientView } from '../patientView';

/** Ficha do paciente > aba "feedback". */
export function FeedbackTab({ v }: { v: PatientView }) {
  const {
    feedbacks,
  } = v;
  return (
    <>
      {feedbacks.length === 0 ? (
        <Card className="shadow-card">
          <CardContent className="py-12 text-center">
            <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum feedback registrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {feedbacks.map((fb: FeedbackRow) => (
            <Card key={fb.id} className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className={`w-4 h-4 ${s <= fb.rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground'}`} />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">{format(new Date(fb.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span>
                </div>
                <p className="text-xs text-muted-foreground mb-1">
                  {fb.session_records?.treatments?.name || 'Sessão'} — {fb.session_records?.performed_at ? format(new Date(fb.session_records.performed_at), 'dd/MM', { locale: ptBR }) : ''}
                </p>
                {fb.comment && <p className="text-sm text-foreground">{fb.comment}</p>}
                {fb.response && (
                  <div className="mt-2 p-2 rounded-lg bg-secondary/50">
                    <p className="text-xs font-medium text-muted-foreground">Resposta:</p>
                    <p className="text-sm text-foreground">{fb.response}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
