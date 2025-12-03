import React from 'react';
import { cn } from '../lib/utils';

interface LayoutProps {
    children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
    return (
        <div className="min-h-screen bg-background font-sans antialiased flex flex-col">
            <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-16 items-center justify-between">
                    <div className="flex items-center gap-2">
                        {/* BPAS Logo Placeholder - Replace with actual SVG or Image */}
                        <div className="h-8 w-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs">
                            BPAS
                        </div>
                        <div className="font-bold text-xl tracking-tight">Fee Calculator</div>
                    </div>
                    <div className="text-sm text-muted-foreground hidden md:block">
                        Professional Fee Estimation
                    </div>
                </div>
            </header>
            <main className="flex-1 container py-6 md:py-8">
                {children}
            </main>
            <footer className="border-t py-6 md:py-0">
                <div className="container flex flex-col items-center justify-between gap-4 md:h-16 md:flex-row">
                    <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
                        &copy; {new Date().getFullYear()} BPAS Architects. All rights reserved.
                    </p>
                    <p className="text-center text-xs text-muted-foreground md:text-right max-w-sm">
                        Disclaimer: This calculator is for estimation purposes only. Final fees are subject to contract and specific project requirements.
                    </p>
                </div>
            </footer>
        </div>
    );
}
