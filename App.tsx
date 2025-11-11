import React, { useState } from 'react';
import { useLocalStorageNumber, useLocalStorageString } from './hooks/useLocalStorage';
import { BasketSection } from './components/BasketSection';
import { SacapSection } from './components/SacapSection';
import { BimSection } from './components/BimSection';
import { HourlySection } from './components/HourlySection';
import { GuidelineSettings } from './components/GuidelineSettings';

type Tab = 'basket' | 'sacap' | 'bim' | 'hourly';

function App() {
  const [clientName, setClientName] = useLocalStorageString('clientName', '');
  const [vatPct, setVatPct] = useLocalStorageNumber('vatPct', 15);
  const [activeTab, setActiveTab] = useLocalStorageString('activeTab', 'basket') as [Tab, (t: Tab) => void];
  const [globalVow, setGlobalVow] = useState(0);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'basket', label: 'Basket of Fees' },
    { key: 'sacap', label: 'SACAP Architect Fees' },
    { key: 'bim', label: 'BIM Fees' },
    { key: 'hourly', label: 'Hourly Fees' },
  ];

  return (
    <div className='bg-zinc-950 text-white min-h-screen font-sans'>
      <main className='max-w-4xl mx-auto p-4 space-y-6'>
        <header className='space-y-4'>
          <h1 className='text-3xl font-bold text-center text-amber-300'>Fee Calculator</h1>
          <div className='grid md:grid-cols-2 gap-4'>
            <div>
              <label htmlFor='clientName' className='text-sm text-zinc-400'>Client / Project Name</label>
              <input id='clientName' className='w-full mt-1 bg-zinc-800 rounded-xl p-2' value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g., Acme Corp Tower" />
            </div>
            <div>
              <label htmlFor='vatPct' className='text-sm text-zinc-400'>VAT (%)</label>
              <input id='vatPct' type='number' min={0} className='w-full mt-1 bg-zinc-800 rounded-xl p-2' value={vatPct} onChange={e => setVatPct(Number(e.target.value))} />
            </div>
          </div>
        </header>
        
        <div className='flex justify-center flex-wrap gap-2 p-1 bg-zinc-900 rounded-xl'>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-amber-400 text-zinc-900' : 'text-zinc-300 hover:bg-zinc-800'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        <div className='space-y-6'>
            {/* FIX: Pass the globalVow state to the BasketSection component. */}
            {activeTab === 'basket' && <BasketSection globalVow={globalVow} onVowChange={setGlobalVow} vatPct={vatPct} clientName={clientName} />}
            {activeTab === 'sacap' && <SacapSection globalVow={globalVow} vatPct={vatPct} />}
            {activeTab === 'bim' && <BimSection clientName={clientName} vatPct={vatPct} />}
            {activeTab === 'hourly' && <HourlySection vatPct={vatPct} />}
        </div>

        <GuidelineSettings />

        <footer className='text-center text-xs text-zinc-600 py-4'>
            <p>Disclaimer: This is a tool for estimation purposes only. All calculations should be verified against the latest official Government Gazettes and professional guidelines.</p>
        </footer>
      </main>
    </div>
  );
}

export default App;