import { Link } from "@/i18n/LocaleLink";
import { useTranslation } from "react-i18next";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface CategoryHeaderProps {
  category: string;
}

const CategoryHeader = ({ category }: CategoryHeaderProps) => {
  const { t } = useTranslation("shop");
  return (
    <section className="w-full px-6 mb-8">
        <div className="mb-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/">{t("category.home")}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{category}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div>
          <h1 className="text-3xl md:text-4xl font-light text-foreground">
            {category}
          </h1>
        </div>
    </section>
  );
};

export default CategoryHeader;
