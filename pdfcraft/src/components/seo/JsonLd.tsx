/**
 * JSON-LD Structured Data Component
 * Renders schema.org structured data as script tags
 */

import React from 'react';
import { serializeStructuredData } from '@/lib/seo';

interface JsonLdProps {
  data: object | object[];
}

/**
 * Renders JSON-LD structured data as a script tag
 * Supports single or multiple schema objects
 */
export function JsonLd({ data }: JsonLdProps) {
  const schemas = Array.isArray(data) ? data : [data];
  
  return (
    <>
      {schemas.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeStructuredData(schema),
          }}
        />
      ))}
    </>
  );
}

/**
 * Props for ToolPageJsonLd component
 */
interface ToolPageJsonLdProps {
  softwareApplication: object;
  faqPage?: object | null;
  breadcrumb?: object;
}

/**
 * Renders all JSON-LD structured data for a tool page
 */
export function ToolPageJsonLd({ 
  softwareApplication, 
  faqPage, 
  breadcrumb 
}: ToolPageJsonLdProps) {
  const schemas: object[] = [softwareApplication];
  
  if (faqPage) {
    schemas.push(faqPage);
  }
  
  if (breadcrumb) {
    schemas.push(breadcrumb);
  }
  
  return <JsonLd data={schemas} />;
}

export default JsonLd;
