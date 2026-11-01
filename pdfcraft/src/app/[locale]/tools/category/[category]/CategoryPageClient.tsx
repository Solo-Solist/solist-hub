'use client';

import { useTranslations } from 'next-intl';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ToolGrid } from '@/components/tools/ToolGrid';
import { getToolsByCategory } from '@/config/tools';
import { type Locale } from '@/lib/i18n/config';
import { type ToolCategory } from '@/types/tool';
import Link from 'next/link';
import { Home, ChevronRight } from 'lucide-react';

interface CategoryPageClientProps {
    locale: Locale;
    category: ToolCategory;
    localizedToolContent?: Record<string, { title: string; description: string }>;
}

export default function CategoryPageClient({ locale, category, localizedToolContent }: CategoryPageClientProps) {
    const t = useTranslations();
    const tools = getToolsByCategory(category);

    // Map categories to translation keys (matching ToolsPage structure)
    const categoryTranslationKeys: Record<ToolCategory, string> = {
        'edit-annotate': 'editAnnotate',
        'convert-to-pdf': 'convertToPdf',
        'convert-from-pdf': 'convertFromPdf',
        'organize-manage': 'organizeManage',
        'optimize-repair': 'optimizeRepair',
        'secure-pdf': 'securePdf',
    };

    const categoryName = t(`home.categories.${categoryTranslationKeys[category]}`);

    return (
        <div className="min-h-screen flex flex-col bg-[hsl(var(--color-background))]">
            <Header locale={locale} />

            <main className="flex-1">
                <div className="container mx-auto px-4 pt-24 pb-8">
                    {/* Breadcrumb Navigation */}
                    <nav aria-label="Breadcrumb" className="mb-4 flex items-center text-sm text-[hsl(var(--color-muted-foreground))] animate-in fade-in slide-in-from-top-4 duration-500 delay-100">
                        <Link
                            href={`/${locale}`}
                            className="flex items-center hover:text-[hsl(var(--color-primary))] transition-colors"
                            title={t('common.navigation.home')}
                        >
                            <Home className="w-4 h-4" />
                        </Link>
                        <ChevronRight className="w-4 h-4 mx-2 text-[hsl(var(--color-border))]" />
                        <Link
                            href={`/${locale}/tools`}
                            className="hover:text-[hsl(var(--color-primary))] transition-colors"
                        >
                            {t('common.navigation.tools')}
                        </Link>
                        <ChevronRight className="w-4 h-4 mx-2 text-[hsl(var(--color-border))]" />
                        <span className="font-medium text-[hsl(var(--color-foreground))] truncate max-w-[200px] sm:max-w-md" aria-current="page">
                            {categoryName}
                        </span>
                    </nav>

                    {/* Page Header */}
                    <section className="relative mb-8">
                        <h1 className="text-3xl font-bold text-[hsl(var(--color-foreground))] mb-2">
                            {categoryName}
                        </h1>
                        <p className="text-base text-[hsl(var(--color-muted-foreground))]">
                            {t(`home.categoriesDescription.${categoryTranslationKeys[category]}`)}
                        </p>
                    </section>

                    {/* Tools Grid */}
                    <ToolGrid
                        tools={tools}
                        locale={locale}
                        localizedToolContent={localizedToolContent}
                    />
                </div>
            </main>

            <Footer locale={locale} />
        </div>
    );
}
