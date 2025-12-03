import React from 'react';
import { cn } from '../lib/utils';

interface LayoutProps {
    children: React.ReactNode;
    className?: string;
}

export function Layout({ children, className }: LayoutProps) {
    return (
        <div className="min-h-screen bg-background font-sans antialiased">
            <div className="relative flex min-h-screen flex-col">
                <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <div className="container flex h-14 max-w-screen-2xl items-center">
                        <div className="mr-4 hidden md:flex">
                            <a className="mr-6 flex items-center space-x-2" href="/">
                                <span className="hidden font-bold sm:inline-block">
                                    Fee Calculator
                                </span>
                            </a>
                        </div>
                    </div>
                </header>
                <main className={cn("flex-1 container max-w-screen-2xl py-6", className)}>
                    {children}
                </main>
                <footer className="py-6 md:px-8 md:py-0">
                    <div className="container flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row">
                        <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
                            Disclaimer: This is a tool for estimation purposes only. Verify against official guidelines.
                        </p>
                    </div>
                </footer>
            </div>
        </div>
    );
}
