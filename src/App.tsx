import React, { useState } from 'react';
import { useLocalStorageNumber, useLocalStorageString } from './hooks/useLocalStorage';
import { BasketSection } from './components/BasketSection';
import { SacapSection } from './components/SacapSection';
import { BimSection } from './components/BimSection';
import { HourlySection } from './components/HourlySection';
import { GuidelineSettings } from './components/GuidelineSettings';
import { SupabaseAuthProvider } from './providers/SupabaseAuthProvider';
import { AuthGate } from './components/AuthGate';
import { ProjectSyncPanel } from './components/ProjectSyncPanel';
import { ProjectsList } from './components/ProjectsList';
import { Layout } from './components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Button } from './components/ui/button';
import { cn } from './lib/utils';

type Tab = 'basket' | 'sacap' | 'bim' | 'hourly';

function App() {
  const [clientName, setClientName] = useLocalStorageString('clientName', '');
  const [vatPct, setVatPct] = useLocalStorageNumber('vatPct', 15);
  const [activeTab, setActiveTab] = useLocalStorageString('activeTab', 'basket') as [Tab, (t: Tab) => void];
  const [globalVow, setGlobalVow] = useState(0);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'basket', label: 'Basket of Fees' },
    { key: 'sacap', label: 'SACAP Architect Fees' },
    { key: 'bim', label: 'BIM Fees' },
    { key: 'hourly', label: 'Hourly Fees' },
  ];

  return (
    <SupabaseAuthProvider>
      <AuthGate>
        <Layout>
          <div className="space-y-8">
            <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
              <div className="space-y-4">
                <ProjectsList onSelectProject={(id) => setSelectedProjectId(id)} />
                <ProjectSyncPanel
                  clientName={clientName}
                  setClientName={setClientName}
                  vatPct={vatPct}
                  setVatPct={setVatPct}
                  globalVow={globalVow}
                  setGlobalVow={setGlobalVow}
                  activeTab={activeTab}
                  setActiveTab={(tab) => setActiveTab(tab as Tab)}
                  selectedProjectId={selectedProjectId}
                  onProjectSelected={(id) => setSelectedProjectId(id)}
                />
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Project Details</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="clientName">Client / Project Name</Label>
                      <Input
                        id="clientName"
                        value={clientName}
                        onChange={e => setClientName(e.target.value)}
                        placeholder="e.g., Acme Corp Tower"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vatPct">VAT (%)</Label>
                      <Input
                        id="vatPct"
                        type="number"
                        min={0}
                        value={vatPct}
                        onChange={e => setVatPct(Number(e.target.value))}
                      />
                    </div>
                  </CardContent>
                </Card>

                <div className="flex space-x-1 rounded-lg bg-muted p-1">
                  {tabs.map(tab => (
                    <Button
                      key={tab.key}
                      variant={activeTab === tab.key ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setActiveTab(tab.key)}
                      className={cn(
                        "flex-1",
                        activeTab === tab.key && "shadow-sm"
                      )}
                    >
                      {tab.label}
                    </Button>
                  ))}
                </div>

                <div className="min-h-[400px]">
                  {activeTab === 'basket' && <BasketSection globalVow={globalVow} onVowChange={setGlobalVow} vatPct={vatPct} clientName={clientName} />}
                  {activeTab === 'sacap' && <SacapSection globalVow={globalVow} vatPct={vatPct} />}
                  {activeTab === 'bim' && <BimSection clientName={clientName} vatPct={vatPct} />}
                  {activeTab === 'hourly' && <HourlySection vatPct={vatPct} />}
                </div>

                <GuidelineSettings />
              </div>
            </div>
          </div>
        </Layout>
      </AuthGate>
    </SupabaseAuthProvider>
  );
}

export default App;
