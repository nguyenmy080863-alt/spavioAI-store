import { NavLink } from "@/i18n/LocaleLink";
import { useTranslation } from 'react-i18next';

const aboutPages = [
  { key: 'ourStory', path: '/about/our-story' },
  { key: 'sustainability', path: '/about/sustainability' },
  { key: 'deviceGuide', path: '/about/device-guide' },
  { key: 'customerCare', path: '/about/customer-care' },
  { key: 'storeLocator', path: '/about/store-locator' }
];

const AboutSidebar = () => {
  const { t } = useTranslation("about");

  return (
    <>
      {/* Desktop Sidebar Navigation */}
      <aside className="hidden lg:block w-72 sticky top-28 h-fit px-8 py-10 border-r border-border/40 min-h-[calc(100vh-7rem)]">
        <nav className="space-y-6">
          <div>
            <span className="text-[10px] uppercase tracking-[0.25em] text-accent font-semibold block mb-2">
              {t("sidebar.explore")}
            </span>
            <h3 className="text-xl font-serif font-normal text-foreground">
              {t("sidebar.heading")}
            </h3>
          </div>
          
          <div className="space-y-1 pt-2">
            {aboutPages.map((page) => (
              <NavLink
                key={page.path}
                to={page.path}
                className={({ isActive }) =>
                  `block py-2.5 text-sm transition-all duration-300 ${
                    isActive
                      ? 'text-foreground font-medium pl-4 border-l-2 border-accent bg-accent/5'
                      : 'text-muted-foreground hover:text-foreground font-normal pl-4 border-l-2 border-transparent hover:border-border'
                  }`
                }
              >
                {t(`sidebar.${page.key}`)}
              </NavLink>
            ))}
          </div>
        </nav>
      </aside>

      {/* Mobile Top Pill Navigation */}
      <div className="lg:hidden w-full px-6 pt-6 overflow-x-auto no-scrollbar border-b border-border/60">
        <div className="flex gap-2 pb-3 min-w-max">
          {aboutPages.map((page) => (
            <NavLink
              key={page.path}
              to={page.path}
              className={({ isActive }) =>
                `px-4 py-2 text-xs font-normal rounded-full transition-all duration-300 ${
                  isActive
                    ? 'bg-primary text-primary-foreground font-medium shadow-xs'
                    : 'bg-secondary/60 text-muted-foreground hover:text-foreground'
                }`
              }
            >
              {t(`sidebar.${page.key}`)}
            </NavLink>
          ))}
        </div>
      </div>
    </>
  );
};

export default AboutSidebar;
