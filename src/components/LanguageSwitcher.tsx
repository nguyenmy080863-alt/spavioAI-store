import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { SUPPORTED_LANGUAGES, getLangFromPath, localizePath, stripLocale } from "@/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface LanguageSwitcherProps {
  className?: string;
}

/** Switches to the same page in another language (/product/x ↔ /vi/product/x). */
const LanguageSwitcher = ({ className = "" }: LanguageSwitcherProps) => {
  const { i18n, t } = useTranslation();
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const currentCode = getLangFromPath(pathname);
  const current = SUPPORTED_LANGUAGES.find((l) => l.code === currentCode) ?? SUPPORTED_LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("language.label")}
        className={`px-2 py-1 text-xs font-light text-nav-foreground hover:text-nav-hover transition-colors duration-200 ${className}`}
      >
        {current.short}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[9rem] rounded-none">
        {SUPPORTED_LANGUAGES.map((language) => (
          <DropdownMenuItem
            key={language.code}
            lang={language.code}
            onSelect={() => {
              if (language.code === current.code) return;
              void i18n.changeLanguage(language.code);
              navigate(localizePath(stripLocale(pathname), language.code) + search + hash);
            }}
            className={`text-sm font-light cursor-pointer ${
              language.code === current.code ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {language.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSwitcher;
