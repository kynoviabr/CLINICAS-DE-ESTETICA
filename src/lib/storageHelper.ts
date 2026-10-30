import { supabase } from '@/integrations/supabase/client';

/**
 * Helper para gerar URLs assinadas temporárias para contratos e assinaturas.
 * Mantém a segurança do bucket sem persistir a URL no banco de dados.
 */
export async function getSignedContractUrl(path: string, expiresIn: number = 60): Promise<string> {
  if (!path) throw new Error('Path inválido para geração de URL assinada');
  
  const { data, error } = await supabase.storage.from('contracts').createSignedUrl(path, expiresIn);
  
  if (error || !data?.signedUrl) {
    console.error('Erro ao gerar signed URL:', error);
    throw new Error('Não foi possível gerar acesso ao arquivo. Tente novamente.');
  }
  
  return data.signedUrl;
}
