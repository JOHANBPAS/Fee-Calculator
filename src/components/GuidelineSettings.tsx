import React from 'react';
import { useLocalStorageString } from '../hooks/useLocalStorage';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';

function parseCSV(text: string): Array<{ from: number; to: number; percent: number }> {
  const out: Array<{ from: number; to: number; percent: number }> = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(1)) {
    const [a, b, c] = line.split(',').map((x) => x.trim());
    const from = Number(a);
    const to = b === 'Infinity' ? Infinity : Number(b);
    const pct = Number(String(c).replace(/%/g, ''));
    if (Number.isFinite(from) && (Number.isFinite(to) || to === Infinity) && Number.isFinite(pct)) {
      out.push({ from, to: to as number, percent: pct / 100 });
    }
  }
  // NOTE: The parsed data is not used in this refactored version as the brackets are hardcoded.
  // This is kept for UI demonstration purposes.
  console.log('Parsed CSV:', out);
  return out;
}

export function GuidelineSettings() {
  const [open, setOpen] = useLocalStorageString('guidelinesOpen', 'closed');
  const isOpen = open === 'open';

  return (
    <Card className="border-dashed">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base font-medium">Guideline Settings (CSV)</CardTitle>
        <div className='flex items-center gap-3'>
          <div className='text-xs text-muted-foreground hidden md:block'>Paste CSVs to update brackets</div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(isOpen ? 'closed' : 'open')}
          >
            {isOpen ? 'Hide' : 'Show'}
          </Button>
        </div>
      </CardHeader>
      {isOpen && (
        <CardContent className="space-y-4">
          <div className='grid md:grid-cols-3 gap-4'>
            <div className="space-y-2">
              <Label>Architect</Label>
              <Textarea className='font-mono text-xs h-32' placeholder={`from,to,percent\n1,20000000,6%\n20000001,100000000,5.5%\n100000001,Infinity,5.0%`} />
              <div className='flex gap-2 items-center'>
                <Button variant="secondary" size="sm" onClick={(e) => { const ta = (e.currentTarget.parentElement?.previousElementSibling as HTMLTextAreaElement); if (!ta) return; parseCSV(ta.value) }}>Apply</Button>
                <span className='text-xs text-muted-foreground'>Example only</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Engineers</Label>
              <Textarea className='font-mono text-xs h-32' placeholder={`from,to,percent\n1,20000000,4%\n20000001,100000000,3.5%\n100000001,Infinity,3.0%`} />
              <div className='flex gap-2 items-center'>
                <Button variant="secondary" size="sm" onClick={(e) => { const ta = (e.currentTarget.parentElement?.previousElementSibling as HTMLTextAreaElement); if (!ta) return; parseCSV(ta.value) }}>Apply</Button>
                <span className='text-xs text-muted-foreground'>Example only</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Quantity Surveyor</Label>
              <Textarea className='font-mono text-xs h-32' placeholder={`from,to,percent\n1,5000000,1.5%\n50000001,20000000,1.25%\n20000001,Infinity,1.0%`} />
              <div className='flex gap-2 items-center'>
                <Button variant="secondary" size="sm" onClick={(e) => { const ta = (e.currentTarget.parentElement?.previousElementSibling as HTMLTextAreaElement); if (!ta) return; parseCSV(ta.value) }}>Apply</Button>
                <span className='text-xs text-muted-foreground'>Example only</span>
              </div>
            </div>
          </div>
          <div className='text-xs text-muted-foreground'>Tip: The calculation logic currently uses hardcoded brackets from Government Gazettes. This section is for demonstration.</div>
        </CardContent>
      )}
    </Card>
  );
}
