import { Link } from 'react-router-dom';
import { Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useStock } from '@/hooks/useStock';
import { useClinicFeatures } from '@/hooks/useClinicFeatures';
import { formatQty } from '@/lib/stock/forecast';

/** Meu dia: o estoque dá conta da agenda de hoje e da semana? */
export function StockSummaryCard({ clinicId }: { clinicId: string | null | undefined }) {
  const stock = useStock(clinicId);
  const { isEnabled } = useClinicFeatures();
  if (!isEnabled('stock') || stock.isLoading || stock.materials.length === 0) return null;

  const todayShort = stock.day.filter((i) => i.status === 'vai_faltar');
  const weekShort = stock.week.filter((i) => i.status === 'vai_faltar');
  const low = stock.week.filter((i) => i.status === 'baixo' || i.status === 'zerado');
  const allGood = !todayShort.length && !weekShort.length && !low.length && !stock.expiring.length;

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4" /> Estoque</CardTitle>
          <Link to="/clinic/estoque" className="text-sm font-medium text-primary underline-offset-2 hover:underline">Abrir estoque</Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {allGood && <p className="text-muted-foreground">Material suficiente para a agenda de hoje e da semana.</p>}
        <p>
          <span className="font-medium">Hoje: </span>
          {todayShort.length
            ? <span className="text-rose-700">falta {todayShort.map((i) => `${i.name} (${formatQty(i.shortfall)} ${i.unit || 'un'})`).join(', ')}</span>
            : <span className="text-muted-foreground">dá conta da agenda.</span>}
        </p>
        <p>
          <span className="font-medium">Semana: </span>
          {weekShort.length
            ? <span className="text-rose-700">comprar {weekShort.map((i) => `${formatQty(i.shortfall)} ${i.unit || 'un'} de ${i.name}`).join(', ')}</span>
            : <span className="text-muted-foreground">dá conta da agenda.</span>}
        </p>
        {low.length > 0 && (
          <p className="text-amber-700">{low.length} material(is) acabando ou zerado(s): {low.slice(0, 4).map((i) => i.name).join(', ')}{low.length > 4 ? '…' : ''}</p>
        )}
        {stock.expiring.length > 0 && (
          <p className="text-orange-700">{stock.expiring.length} lote(s) vencendo em até 10 dias.</p>
        )}
      </CardContent>
    </Card>
  );
}
