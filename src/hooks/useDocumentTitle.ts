import { useEffect } from 'react';

/** Título da aba do navegador nas páginas do paciente: o nome da clínica, não o do sistema. */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    return () => { document.title = previous; };
  }, [title]);
}
