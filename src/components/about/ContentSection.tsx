interface ContentSectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const ContentSection = ({ title, children, className = "" }: ContentSectionProps) => {
  return (
    <section className={`py-6 md:py-8 ${className}`}>
      {title && (
        <h2 className="text-2xl md:text-3xl font-serif font-normal text-foreground tracking-wide mb-4">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
};

export default ContentSection;