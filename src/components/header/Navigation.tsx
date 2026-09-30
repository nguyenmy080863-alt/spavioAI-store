import { ArrowRight, X } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { Link, useLocaleNavigate } from "@/i18n/LocaleLink";
import { useTranslation } from "react-i18next";
import ShoppingBag from "./ShoppingBag";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLocation } from "react-router-dom";
import { SUPPORTED_LANGUAGES, getLangFromPath, localizePath, stripLocale } from "@/i18n";
import { useCart } from "@/context/CartContext";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { useStorefrontProducts } from "@/hooks/useCatalog";
import { useProductText } from "@/i18n/useProductText";
import { formatPrice, LOCAL_ASSETS, collectionImage } from "@/data/products";
import StoreLogo from "@/components/StoreLogo";
import ledMaskImage from "@/assets/products/lumina-led-mask.svg";
import iplImage from "@/assets/products/silk-ipl.svg";
import dryerImage from "@/assets/products/aura-ionic-dryer.svg";
import lumiporeImage from "@/assets/brand/lumipore-lift.png";
import spavioLogo from "@/assets/brand/spavioai-logo.png";

interface DropdownImage {
  src: string;
  alt: string;
  label: string;
  linkTo: string;
  /** Designed cards rendered in code instead of a plain photo. */
  variant?: "product-stage" | "brand";
}

/** Lilac stage with the brand rings, shared by the designed menu cards. */
const StageBackdrop = () => (
  <>
    <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,#FFFFFF_0%,#F3EDFE_45%,#E4D8FB_100%)]" />
    <div aria-hidden="true" className="absolute left-1/2 top-[42%] h-[250px] w-[250px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#A78CE1]/35" />
    <div aria-hidden="true" className="absolute left-1/2 top-[42%] h-[170px] w-[170px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#A78CE1]/25" />
  </>
);

const MenuCardVisual = ({ image, tagline }: { image: DropdownImage; tagline: string }) => {
  if (image.variant === "product-stage") {
    return (
      <>
        <StageBackdrop />
        <img
          src={image.src}
          alt={image.alt}
          className="absolute bottom-[-12%] left-1/2 h-[118%] w-auto -translate-x-1/2 rotate-[-8deg] transition-transform duration-500 group-hover:-translate-y-2 [mask-image:linear-gradient(to_bottom,black_75%,transparent)]"
        />
      </>
    );
  }
  if (image.variant === "brand") {
    return (
      <>
        <StageBackdrop />
        <div aria-hidden="true" className="absolute left-1/2 top-[40%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#761DEA]/15 blur-3xl" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pb-8 transition-transform duration-500 group-hover:scale-[1.03]">
          <img src={image.src} alt={image.alt} className="h-11 w-auto" />
          <span className="h-px w-16 bg-brand-gradient" aria-hidden="true" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#5346A7]">{tagline}</span>
        </div>
      </>
    );
  }
  return (
    <img
      src={image.src}
      alt={image.alt}
      className="w-full h-full object-cover object-top transition-opacity duration-200 group-hover:opacity-90"
    />
  );
};

const popularSearchKeys = ["led", "microcurrent", "ipl", "hairDryer", "massage", "serum"];

const Navigation = () => {
  const { t } = useTranslation("common");
  const navigate = useLocaleNavigate();
  const location = useLocation();
  const currentLang = getLangFromPath(location.pathname);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [offCanvasType, setOffCanvasType] = useState<'favorites' | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { totalItems, isBagOpen, openBag, closeBag } = useCart();
  const { user, isAdmin } = useAdminAuth();
  const [isScrolled, setIsScrolled] = useState(false);

  const { data: rawProducts = [] } = useStorefrontProducts();
  const { localize } = useProductText();
  const products = useMemo(() => rawProducts.map(localize), [rawProducts, localize]);

  // Filter live search suggestions based on searchQuery
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return products.filter((p) =>
      p.name.toLowerCase().includes(query) ||
      p.category.toLowerCase().includes(query) ||
      (p.effect && p.effect.toLowerCase().includes(query)) ||
      (p.description && p.description.toLowerCase().includes(query))
    ).slice(0, 5); // Display top 5 live results
  }, [searchQuery, products]);

  // Preload dropdown images for faster display
  useEffect(() => {
    [ledMaskImage, iplImage, lumiporeImage, dryerImage, spavioLogo].forEach(src => {
      const img = new Image();
      img.src = src;
    });

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setIsSearchOpen(false);
      navigate(`/category/shop?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  };

  const handlePopularSearch = (termKey: string) => {
    const term = t(`search.terms.${termKey}`) || termKey;
    setIsSearchOpen(false);
    navigate(`/category/shop?search=${encodeURIComponent(term)}`);
    setSearchQuery("");
  };

  const getProductImage = (item: any) => {
    if (item.image && typeof item.image === "string" && item.image.trim() !== "" && !item.image.includes("undefined")) {
      return item.image;
    }
    if (item.id && LOCAL_ASSETS[item.id]) {
      return LOCAL_ASSETS[item.id];
    }
    return collectionImage;
  };

  const navItems = [
    {
      key: "shop",
      label: t("nav.shop"),
      href: "/category/shop",
      submenuItems: [
        { key: "skincare-devices", to: "/category/skincare-devices" },
        { key: "hair-removal", to: "/category/hair-removal" },
        { key: "hair-styling-care", to: "/category/hair-styling-and-care" },
        { key: "body-wellness", to: "/category/body-and-wellness" },
      ],
      images: [
        { src: ledMaskImage, alt: t("nav.submenu.skincare-devices"), label: t("nav.submenu.skincare-devices"), linkTo: "/category/skincare-devices" },
        { src: iplImage, alt: t("nav.submenu.hair-removal"), label: t("nav.submenu.hair-removal"), linkTo: "/category/hair-removal" }
      ] as DropdownImage[]
    },
    {
      key: "newIn",
      label: t("nav.newIn"),
      href: "/category/new-in",
      submenuItems: [
        { key: "arrivals", to: "/category/new-in" },
        { key: "best-sellers", to: "/category/best-sellers" },
        { key: "anti-aging", to: "/category/anti-aging" },
        { key: "on-sale", to: "/category/sale" },
        { key: "under-100", to: "/category/under-100" },
      ],
      images: [
        { src: lumiporeImage, alt: t("nav.cards.lumiporeAlt"), label: t("nav.cards.lumipore"), linkTo: "/product/lumipore", variant: "product-stage" },
        { src: dryerImage, alt: t("nav.cards.dryerAlt"), label: t("nav.cards.dryer"), linkTo: "/product/aura-ionic-dryer" }
      ] as DropdownImage[]
    },
    {
      key: "about",
      label: t("nav.about"),
      href: "/about/our-story",
      submenuItems: [
        { key: "our-story", to: "/about/our-story" },
        { key: "sustainability", to: "/about/sustainability" },
        { key: "device-guide", to: "/about/device-guide" },
        { key: "customer-care", to: "/about/customer-care" },
        { key: "store-locator", to: "/about/store-locator" },
      ],
      images: [
        { src: spavioLogo, alt: t("nav.cards.brandAlt"), label: t("nav.cards.readOurStory"), linkTo: "/about/our-story", variant: "brand" }
      ] as DropdownImage[]
    }
  ];

  return (
    <nav
      className={`relative w-full transition-all duration-300 ${
        isScrolled 
          ? "bg-background/90 backdrop-blur-md shadow-[0_4px_30px_rgba(0,0,0,0.03)] border-b border-accent/15" 
          : "bg-background/85 backdrop-blur-sm border-b border-transparent"
      }`}
    >
      <div className={`flex items-center justify-between px-6 transition-all duration-300 ${isScrolled ? "h-14" : "h-20"}`}>
        {/* Mobile hamburger button */}
        <button
          className="lg:hidden p-2 mt-0.5 text-nav-foreground hover:text-nav-hover transition-colors duration-200"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label={t("nav.toggleMenu")}
        >
          <div className="w-5 h-5 relative">
            <span className={`absolute block w-5 h-px bg-current transform transition-all duration-300 ${
              isMobileMenuOpen ? 'rotate-45 top-2.5' : 'top-1.5'
            }`}></span>
            <span className={`absolute block w-5 h-px bg-current transform transition-all duration-300 top-2.5 ${
              isMobileMenuOpen ? 'opacity-0' : 'opacity-100'
            }`}></span>
            <span className={`absolute block w-5 h-px bg-current transform transition-all duration-300 ${
              isMobileMenuOpen ? '-rotate-45 top-2.5' : 'top-3.5'
            }`}></span>
          </div>
        </button>

        {/* Left navigation */}
        <div className="hidden lg:flex space-x-8">
          {navItems.map((item) => (
            <div
              key={item.key}
              className="relative"
              onMouseEnter={() => setActiveDropdown(item.key)}
              onMouseLeave={() => setActiveDropdown(null)}
            >
              <Link
                to={item.href}
                className={`text-nav-foreground hover:text-nav-hover transition-all duration-300 text-xs tracking-[0.15em] uppercase font-medium block ${
                  isScrolled ? "py-4" : "py-6"
                }`}
              >
                {item.label}
              </Link>
            </div>
          ))}
        </div>

        {/* Center logo */}
        <div className="absolute left-1/2 transform -translate-x-1/2">
          <Link to="/" className="block">
            <StoreLogo heightClass={isScrolled ? "h-5 sm:h-6" : "h-6 sm:h-8"} badgeClassName="hidden sm:inline-block" />
          </Link>
        </div>

        {/* Right icons */}
        <div className="flex items-center space-x-2">
          <LanguageSwitcher className="hidden sm:block" />

          <button
            className="p-2 text-nav-foreground hover:text-nav-hover transition-colors duration-200"
            aria-label={t("nav.search")}
            onClick={() => setIsSearchOpen(!isSearchOpen)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </button>
          <button
            className="hidden lg:block p-2 text-nav-foreground hover:text-nav-hover transition-colors duration-200"
            aria-label={t("nav.favorites")}
            onClick={() => setOffCanvasType('favorites')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
            </svg>
          </button>
          {isAdmin && (
            <Link
              to="/admin"
              className="hidden lg:block px-2 text-nav-foreground hover:text-nav-hover transition-colors duration-200 text-xs font-light uppercase tracking-wide"
            >
              Admin
            </Link>
          )}
          <Link
            to={user ? "/account" : "/login"}
            className="p-2 text-nav-foreground hover:text-nav-hover transition-colors duration-200"
            aria-label={user ? t("nav.account") : t("nav.signIn")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </Link>
          <button
            className="p-2 text-nav-foreground hover:text-nav-hover transition-colors duration-200 relative"
            aria-label={t("nav.shoppingBag")}
            onClick={openBag}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
            {totalItems > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-brand-gradient text-[0.6rem] leading-4 text-center font-bold text-white pointer-events-none">
                {totalItems}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Full width dropdown */}
      {activeDropdown && (
        <div
          className="absolute top-full left-0 right-0 bg-nav border-b border-border z-50"
          onMouseEnter={() => setActiveDropdown(activeDropdown)}
          onMouseLeave={() => setActiveDropdown(null)}
        >
          <div className="px-6 py-8">
            <div className="flex justify-between w-full">
              {/* Left side - Menu items */}
              <div className="flex-1">
                <ul className="space-y-2">
                   {navItems
                     .find(item => item.key === activeDropdown)
                     ?.submenuItems.map((subItem) => (
                      <li key={subItem.key}>
                        <Link
                          to={subItem.to}
                          className="text-nav-foreground hover:text-nav-hover transition-colors duration-200 text-sm font-light block py-2"
                        >
                          {t(`nav.submenu.${subItem.key}`)}
                        </Link>
                      </li>
                   ))}
                </ul>
              </div>

              {/* Right side - Images */}
              <div className="flex space-x-6">
                {navItems
                  .find(item => item.key === activeDropdown)
                  ?.images.map((image, index) => {
                    return (
                      <Link key={index} to={image.linkTo} className="w-[400px] h-[280px] cursor-pointer group relative overflow-hidden block rounded-2xl">
                        <MenuCardVisual image={image} tagline={t("nav.cards.brandTagline")} />
                        <div className="absolute bottom-3 left-3 rounded-full bg-[#1E1633]/70 backdrop-blur-md px-3 py-1.5 text-white text-xs font-medium flex items-center gap-1">
                          <span>{image.label}</span>
                          <ArrowRight size={12} />
                        </div>
                      </Link>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search overlay */}
      {isSearchOpen && (
        <div className="absolute top-full left-0 right-0 bg-nav border-b border-border z-50 shadow-xl">
          <div className="px-6 py-8">
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Search input form */}
              <form onSubmit={handleSearchSubmit} className="relative">
                <div className="flex items-center border-b border-border pb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5 text-nav-foreground mr-3 shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t("search.placeholder") || "Search for devices..."}
                    className="flex-1 bg-transparent text-nav-foreground placeholder:text-nav-foreground/60 outline-none text-lg"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="text-xs text-muted-foreground hover:text-foreground px-2"
                    >
                      {t("search.clear")}
                    </button>
                  )}
                </div>
              </form>

              {/* Live search result suggestions */}
              {searchQuery.trim() !== "" && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    {t("search.matching", { count: searchResults.length })}
                  </h4>
                  {searchResults.length > 0 ? (
                    <div className="divide-y divide-border/40">
                      {searchResults.map((product) => (
                        <Link
                          key={product.id}
                          to={`/product/${product.slug}`}
                          onClick={() => {
                            setIsSearchOpen(false);
                            setSearchQuery("");
                          }}
                          className="flex items-center gap-4 py-3 hover:bg-muted/10 transition-colors rounded-sm px-2 group"
                        >
                          <img
                            src={getProductImage(product)}
                            alt={product.name}
                            className="w-12 h-12 object-cover rounded-sm border border-border"
                          />
                          <div className="flex-1">
                            <h5 className="text-sm font-medium text-foreground group-hover:text-accent transition-colors">
                              {product.name}
                            </h5>
                            <p className="text-xs text-muted-foreground">{product.categoryLabel}</p>
                          </div>
                          <span className="text-sm font-semibold text-foreground">
                            {formatPrice(product.salePrice ?? product.price)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic py-2">
                      {t("search.noResults", { query: searchQuery })}
                    </p>
                  )}
                </div>
              )}

              {/* Popular searches */}
              <div>
                <h3 className="text-nav-foreground text-sm font-light mb-4">{t("search.popular")}</h3>
                <div className="flex flex-wrap gap-3">
                  {popularSearchKeys.map((key) => (
                    <button
                      key={key}
                      onClick={() => handlePopularSearch(key)}
                      className="text-nav-foreground hover:text-nav-hover text-sm font-light py-2 px-4 border border-border rounded-full transition-colors duration-200 hover:border-nav-hover"
                    >
                      {t(`search.terms.${key}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile navigation menu */}
      {isMobileMenuOpen && (
        <div className="lg:hidden absolute top-full left-0 right-0 bg-nav border-b border-border z-50">
          <div className="px-6 py-8">
            <div className="space-y-6">
              {navItems.map((item) => (
                <div key={item.key}>
                  <Link
                    to={item.href}
                    className="text-nav-foreground hover:text-nav-hover transition-colors duration-200 text-lg font-light block py-2"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                   <div className="mt-3 pl-4 space-y-2">
                     {item.submenuItems.map((subItem) => (
                       <Link
                         key={subItem.key}
                         to={subItem.to}
                         className="text-nav-foreground/70 hover:text-nav-hover text-sm font-light block py-1"
                         onClick={() => setIsMobileMenuOpen(false)}
                       >
                         {t(`nav.submenu.${subItem.key}`)}
                       </Link>
                     ))}
                   </div>
                </div>
              ))}
              {/* Language links for small screens (the header toggle is hidden there) */}
              <nav aria-label={t("language.label")} className="sm:hidden flex gap-4 border-t border-border pt-6">
                {SUPPORTED_LANGUAGES.map((language) => (
                  <a
                    key={language.code}
                    href={localizePath(stripLocale(location.pathname), language.code) + location.search}
                    hrefLang={language.code}
                    lang={language.code}
                    aria-current={language.code === currentLang ? "true" : undefined}
                    className={`text-sm ${language.code === currentLang ? "font-semibold text-foreground" : "font-light text-nav-foreground/70 hover:text-nav-hover"}`}
                  >
                    {language.label}
                  </a>
                ))}
              </nav>
            </div>
          </div>
        </div>
      )}

      {/* Shopping Bag Component */}
      <ShoppingBag
        isOpen={isBagOpen}
        onClose={closeBag}
        onViewFavorites={() => {
          closeBag();
          setOffCanvasType('favorites');
        }}
      />

      {/* Favorites Off-canvas overlay */}
      {offCanvasType === 'favorites' && (
        <div className="fixed inset-0 z-50 h-screen">
          <div
            className="absolute inset-0 bg-black/50 h-screen"
            onClick={() => setOffCanvasType(null)}
          />
          <div className="absolute right-0 top-0 h-screen w-96 bg-background border-l border-border animate-slide-in-right flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-lg font-light text-foreground">{t("favorites.title")}</h2>
              <button
                onClick={() => setOffCanvasType(null)}
                className="p-2 text-foreground hover:text-muted-foreground transition-colors"
                aria-label={t("nav.close")}
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-muted-foreground text-sm mb-6">
                {t("favorites.empty")}
              </p>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navigation;
