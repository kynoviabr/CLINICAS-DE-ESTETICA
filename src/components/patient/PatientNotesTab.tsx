import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BrandButton } from '@/components/ui/brand-button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  parsePatientNotes,
  serializePatientNotes,
  type PatientNoteEntry,
} from '@/lib/patients/notesHistory';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { NotebookPen, Plus, Trash2, Clock, UserCheck } from 'lucide-react';

interface PatientNotesTabProps {
  patientId: string;
  clinicId: string;
  rawNotes?: string | null;
  onNotesUpdated?: () => void;
}

export function PatientNotesTab({
  patientId,
  clinicId,
  rawNotes,
  onNotesUpdated,
}: PatientNotesTabProps) {
  const [newNote, setNewNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { user } = useAuth();
  const { role } = useUserRole();
  const { toast } = useToast();

  const notesList = parsePatientNotes(rawNotes);

  const getAuthorName = () => {
    const meta = user?.user_metadata;
    return meta?.full_name || meta?.name || user?.email?.split('@')[0] || 'Atendente';
  };

  const getAuthorRole = () => {
    switch (role) {
      case 'professional':
        return 'Profissional';
      case 'admin':
        return 'Administrador';
      case 'receptionist':
        return 'Recepção';
      default:
        return 'Equipe clínica';
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newNote.trim();
    if (!trimmed) {
      toast({ title: 'Aviso', description: 'Digite uma observação antes de salvar.', variant: 'destructive' });
      return;
    }

    try {
      setIsSaving(true);
      const newEntry: PatientNoteEntry = {
        id: crypto.randomUUID ? crypto.randomUUID() : `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        date: new Date().toISOString(),
        author_name: getAuthorName(),
        author_role: getAuthorRole(),
        text: trimmed,
      };

      const updated = [newEntry, ...notesList];
      const serialized = serializePatientNotes(updated);

      const { error } = await supabase
        .from('patients')
        .update({ notes: serialized })
        .eq('id', patientId)
        .eq('clinic_id', clinicId);

      if (error) throw error;

      setNewNote('');
      toast({ title: 'Observação registrada com sucesso!' });
      onNotesUpdated?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar observação.';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Deseja realmente excluir esta observação do histórico?')) return;

    try {
      setDeletingId(noteId);
      const updated = notesList.filter((n) => n.id !== noteId);
      const serialized = updated.length > 0 ? serializePatientNotes(updated) : null;

      const { error } = await supabase
        .from('patients')
        .update({ notes: serialized })
        .eq('id', patientId)
        .eq('clinic_id', clinicId);

      if (error) throw error;

      toast({ title: 'Observação removida.' });
      onNotesUpdated?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir observação.';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Formulário para registrar nova observação */}
      <Card className="shadow-card border-border/80">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <NotebookPen className="w-5 h-5 text-primary" />
              <CardTitle className="text-base sm:text-lg">Nova Observação</CardTitle>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 bg-muted/50 px-2.5 py-1 rounded-full">
              <UserCheck className="w-3.5 h-3.5 text-primary" />
              <span>Registrando como: <strong>{getAuthorName()}</strong> ({getAuthorRole()})</span>
            </div>
          </div>
          <CardDescription className="text-xs">
            Adicione anotações de evolução clínica, preferências, histórico de contato ou orientações.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddNote} className="space-y-3">
            <Textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Digite aqui a observação para ficar gravada no histórico do paciente..."
              rows={3}
              className="resize-y text-sm bg-background"
            />
            <div className="flex justify-end gap-2">
              {newNote.trim() && (
                <BrandButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setNewNote('')}
                  disabled={isSaving}
                >
                  Limpar
                </BrandButton>
              )}
              <BrandButton type="submit" size="sm" disabled={isSaving || !newNote.trim()}>
                <Plus className="w-4 h-4 mr-1" />
                {isSaving ? 'Salvando...' : 'Adicionar Observação'}
              </BrandButton>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Histórico de observações */}
      <Card className="shadow-card border-border/80">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <span>Histórico de Notas e Observações</span>
              <span className="text-xs font-normal text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                {notesList.length} {notesList.length === 1 ? 'registro' : 'registros'}
              </span>
            </CardTitle>
            <CardDescription className="text-xs">
              Histórico cronológico com data, autor e conteúdo das anotações.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {notesList.length === 0 ? (
            <div className="text-center py-12 px-4 border border-dashed rounded-xl bg-muted/10">
              <NotebookPen className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-foreground">Nenhuma observação registrada</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Utilize o campo acima para adicionar anotações clínicas, observações de recepção ou alertas para a equipe.
              </p>
            </div>
          ) : (
            <div className="space-y-3 divide-y divide-border/50">
              {notesList.map((entry, idx) => {
                const noteDate = new Date(entry.date);
                const isValidDate = !isNaN(noteDate.getTime());
                return (
                  <div key={entry.id || idx} className={`${idx > 0 ? 'pt-3' : ''}`}>
                    <div className="rounded-lg border border-border/60 bg-card p-4 hover:border-primary/30 transition-colors">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-foreground">
                            {entry.author_name || 'Usuário'}
                          </span>
                          {entry.author_role && (
                            <span className="text-[11px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                              {entry.author_role}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {isValidDate
                              ? format(noteDate, "dd 'de' MMM. 'de' yyyy 'às' HH:mm", { locale: ptBR })
                              : 'Data indisponível'}
                          </span>
                          {isValidDate && (
                            <span className="text-[11px] opacity-75 hidden sm:inline">
                              ({formatDistanceToNow(noteDate, { addSuffix: true, locale: ptBR })})
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(entry.id)}
                            disabled={deletingId === entry.id}
                            className="ml-2 text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                            title="Excluir observação"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <p className="mt-2.5 text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed font-normal">
                        {entry.text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
