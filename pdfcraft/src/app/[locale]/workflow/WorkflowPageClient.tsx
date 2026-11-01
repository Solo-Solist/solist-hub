'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Home, Wrench, HelpCircle, FileText, GitBranch } from 'lucide-react';
import { type Locale } from '@/lib/i18n/config';

// 动态导入 WorkflowEditor 以避免 SSR 问题（ReactFlow 需要 window 对象）
const WorkflowEditor = dynamic(
    () => import('@/components/workflow/WorkflowEditor').then(mod => mod.WorkflowEditor),
    {
        ssr: false,
        loading: () => (
            <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-3 border-[hsl(var(--color-primary))] border-t-transparent rounded-full animate-spin" />
                    <p className="text-[hsl(var(--color-muted-foreground))]">Loading workflow editor...</p>
                </div>
            </div>
        )
    }
);

interface WorkflowPageClientProps {
    locale: Locale;
}

export default function WorkflowPageClient({ locale }: WorkflowPageClientProps) {
    const t = useTranslations('common');
    const tWorkflow = useTranslations('workflow');

    return (
        <div className="h-screen flex flex-col bg-[hsl(var(--color-background))]">
            {/* Compact Top Navigation Bar - 48px */}
            <header className="h-12 flex-shrink-0 border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-background))] px-4 flex items-center justify-between">
                {/* Left: Logo and Title */}
                <div className="flex items-center gap-3">
                    <Link
                        href={`/${locale}`}
                        className="flex items-center gap-2 text-[hsl(var(--color-foreground))] hover:text-[hsl(var(--color-primary))] transition-colors"
                    >
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[hsl(var(--color-primary))] to-[hsl(var(--color-accent))] shadow-sm">
                            <svg
                                className="h-4 w-4 text-white"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                <polyline points="14 2 14 8 20 8" />
                            </svg>
                        </div>
                        <span className="font-semibold text-sm hidden sm:inline">{t('brand')}</span>
                    </Link>

                    <span className="text-[hsl(var(--color-border))]">|</span>

                    <div className="flex items-center gap-1.5">
                        <GitBranch className="w-4 h-4 text-[hsl(var(--color-primary))]" />
                        <h1 className="text-sm font-medium text-[hsl(var(--color-foreground))]">
                            {tWorkflow('title') || 'PDF Workflow Builder'}
                        </h1>
                    </div>
                </div>

                {/* Right: Navigation Links */}
                <nav className="flex items-center gap-1">
                    <Link
                        href={`/${locale}`}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))] rounded-md transition-colors"
                    >
                        <Home className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">{t('navigation.home')}</span>
                    </Link>
                    <Link
                        href={`/${locale}/tools`}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))] rounded-md transition-colors"
                    >
                        <Wrench className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">{t('navigation.tools')}</span>
                    </Link>
                    <Link
                        href={`/${locale}/about`}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))] rounded-md transition-colors"
                    >
                        <FileText className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">{t('navigation.about')}</span>
                    </Link>
                    <Link
                        href={`/${locale}/faq`}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))] rounded-md transition-colors"
                    >
                        <HelpCircle className="w-3.5 h-3.5" />
                        <span className="hidden md:inline">{t('navigation.faq')}</span>
                    </Link>
                </nav>
            </header>

            {/* Workflow Editor - fills remaining height */}
            <main id="main-content" className="flex-1 overflow-hidden" tabIndex={-1}>
                <WorkflowEditor />
            </main>
        </div>
    );
}
