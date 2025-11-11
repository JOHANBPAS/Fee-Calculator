
import React from 'react';
import { useLocalStorageString } from '../hooks/useLocalStorage';

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
    <section className='p-3 bg-zinc-900/70 border border-white/5 rounded-2xl shadow-lg backdrop-blur space-y-3'>
      <div className='flex items-center justify-between'>
        <h2 className='text-lg font-medium'>Guideline Settings (CSV)</h2>
        <div className='flex items-center gap-3'>
          <div className='text-xs text-zinc-400 hidden md:block'>Paste CSVs to update brackets</div>
          <button
            className='px-3 py-1.5 bg-zinc-800 rounded-lg text-sm hover:bg-zinc-700'
            onClick={() => setOpen(isOpen ? 'closed' : 'open')}
          >
            {isOpen ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      {isOpen && (
        <div className='grid md:grid-cols-3 gap-4'>
          <div>
            <div className='text-sm font-medium'>Architect</div>
            <textarea className='w-full h-32 bg-zinc-800 rounded-xl p-2 font-mono text-xs' placeholder={`from,to,percent\n1,20000000,6%\n20000001,100000000,5.5%\n100000001,Infinity,5.0%`}></textarea>
            <div className='flex gap-2 mt-1'>
              <button className='px-3 py-2 bg-zinc-700 rounded-xl transition-colors duration-150 hover:bg-zinc-600' onClick={(e) => { const ta = (e.currentTarget.parentElement?.previousElementSibling as HTMLTextAreaElement); if (!ta) return; parseCSV(ta.value) }}>Apply</button>
              <div className='text-xs text-zinc-400'>Example only</div>
            </div>
          </div>
          <div>
            <div className='text-sm font-medium'>Engineers</div>
            <textarea className='w-full h-32 bg-zinc-800 rounded-xl p-2 font-mono text-xs' placeholder={`from,to,percent\n1,20000000,4%\n20000001,100000000,3.5%\n100000001,Infinity,3.0%`}></textarea>
            <div className='flex gap-2 mt-1'>
              <button className='px-3 py-2 bg-zinc-700 rounded-xl transition-colors duration-150 hover:bg-zinc-600' onClick={(e) => { const ta = (e.currentTarget.parentElement?.previousElementSibling as HTMLTextAreaElement); if (!ta) return; parseCSV(ta.value) }}>Apply</button>
              <div className='text-xs text-zinc-400'>Example only</div>
            </div>
          </div>
          <div>
            <div className='text-sm font-medium'>Quantity Surveyor</div>
            <textarea className='w-full h-32 bg-zinc-800 rounded-xl p-2 font-mono text-xs' placeholder={`from,to,percent\n1,5000000,1.5%\n50000001,20000000,1.25%\n20000001,Infinity,1.0%`}></textarea>
            <div className='flex gap-2 mt-1'>
              <button className='px-3 py-2 bg-zinc-700 rounded-xl transition-colors duration-150 hover:bg-zinc-600' onClick={(e) => { const ta = (e.currentTarget.parentElement?.previousElementSibling as HTMLTextAreaElement); if (!ta) return; parseCSV(ta.value) }}>Apply</button>
              <div className='text-xs text-zinc-400'>Example only</div>
            </div>
          </div>
        </div>
      )}
      <div className='text-xs text-zinc-500'>Tip: The calculation logic currently uses hardcoded brackets from Government Gazettes. This section is for demonstration.</div>
    </section>
  );
}
