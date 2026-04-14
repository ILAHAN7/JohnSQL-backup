import { Button } from "@/components/ui/button"
import { ArrowRight, ShoppingBag, BookOpen, Sofa, Cpu, Package } from "lucide-react"
import { Link } from "react-router-dom"

const CAMPUS = 'uiuc'

export function HomePage() {
    return (
        <div className="flex flex-col items-center w-full bg-white">
            {/* Hero */}
            <section className="w-full py-20 md:py-32 lg:py-40 flex flex-col items-center text-center px-4 animate-in fade-in duration-700 slide-in-from-bottom-4">
                <div className="space-y-6 max-w-4xl">
                    <div className="inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary mb-4">
                        UIUC Campus Marketplace
                    </div>
                    <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1]">
                        Buy & sell with<br className="hidden sm:inline" />
                        <span className="text-primary"> fellow Illini</span>
                    </h1>
                    <p className="mx-auto max-w-[600px] text-muted-foreground text-lg md:text-xl leading-relaxed">
                        Textbooks, furniture, electronics, and more —<br className="hidden sm:inline" />
                        listed by UIUC students, for UIUC students.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 mt-10 w-full sm:w-auto">
                    <Button size="lg" asChild className="h-12 px-8 rounded-full shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5">
                        <Link to={`/campus/${CAMPUS}/listings`}>
                            Browse Listings
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                    <Button size="lg" variant="outline" asChild className="h-12 px-8 rounded-full">
                        <Link to={`/campus/${CAMPUS}/listings/new`}>
                            Post a Listing
                        </Link>
                    </Button>
                </div>
            </section>

            {/* Category Cards */}
            <section className="w-full max-w-7xl px-4 pb-24 md:pb-32">
                <h2 className="text-2xl font-bold text-center mb-8 text-foreground">Browse by Category</h2>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    <CategoryCard
                        title="Electronics"
                        description="Laptops, phones, calculators, and gear."
                        href={`/campus/${CAMPUS}/listings?category=ELECTRONICS`}
                        icon={<Cpu className="h-7 w-7 text-white" />}
                        color="bg-blue-500"
                    />
                    <CategoryCard
                        title="Textbooks"
                        description="Course books at a fraction of the price."
                        href={`/campus/${CAMPUS}/listings?category=TEXTBOOKS`}
                        icon={<BookOpen className="h-7 w-7 text-white" />}
                        color="bg-orange-500"
                    />
                    <CategoryCard
                        title="Furniture"
                        description="Desks, chairs, shelves — move-in ready."
                        href={`/campus/${CAMPUS}/listings?category=FURNITURE`}
                        icon={<Sofa className="h-7 w-7 text-white" />}
                        color="bg-green-500"
                    />
                    <CategoryCard
                        title="Everything Else"
                        description="Clothing, appliances, and more."
                        href={`/campus/${CAMPUS}/listings`}
                        icon={<Package className="h-7 w-7 text-white" />}
                        color="bg-purple-500"
                    />
                </div>
            </section>

            {/* How it works */}
            <section className="w-full bg-muted/30 py-20 px-4">
                <div className="max-w-4xl mx-auto text-center space-y-12">
                    <h2 className="text-2xl font-bold">How johnSQL works</h2>
                    <div className="grid sm:grid-cols-3 gap-8">
                        <div className="space-y-3">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                                <span className="text-primary font-bold text-lg">1</span>
                            </div>
                            <h3 className="font-semibold">Sign in with UIUC email</h3>
                            <p className="text-sm text-muted-foreground">Verify your @illinois.edu address with a one-time code.</p>
                        </div>
                        <div className="space-y-3">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                                <span className="text-primary font-bold text-lg">2</span>
                            </div>
                            <h3 className="font-semibold">Browse or post listings</h3>
                            <p className="text-sm text-muted-foreground">Find what you need or list items to sell in minutes.</p>
                        </div>
                        <div className="space-y-3">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                                <span className="text-primary font-bold text-lg">3</span>
                            </div>
                            <h3 className="font-semibold">Chat & meet on campus</h3>
                            <p className="text-sm text-muted-foreground">Message the seller and arrange a safe campus meetup.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer CTA */}
            <section className="w-full py-16 px-4 text-center">
                <ShoppingBag className="h-10 w-10 text-primary/30 mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Ready to start?</h2>
                <p className="text-muted-foreground mb-6 text-sm">Join students already buying and selling on johnSQL.</p>
                <Button asChild>
                    <Link to={`/campus/${CAMPUS}/listings`}>View All Listings</Link>
                </Button>
            </section>
        </div>
    )
}

function CategoryCard({ title, description, href, icon, color }: {
    title: string
    description: string
    href: string
    icon: React.ReactNode
    color: string
}) {
    return (
        <Link
            to={href}
            className="group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-gray-50 p-7 transition-all hover:bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.07)] hover:-translate-y-1 border border-transparent hover:border-gray-100"
        >
            <div className="space-y-4">
                <div className={`inline-flex items-center justify-center rounded-xl p-3 shadow-sm ${color}`}>
                    {icon}
                </div>
                <h3 className="font-bold text-lg">{title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">{description}</p>
            </div>
            <div className="mt-6 flex items-center text-sm font-semibold text-muted-foreground transition-colors group-hover:text-primary">
                Browse <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </div>
        </Link>
    )
}
