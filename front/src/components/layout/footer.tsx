export function Footer() {
    return (
        <footer className="border-t py-6 md:px-8 md:py-0 bg-background">
            <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 md:h-24 md:flex-row px-4 md:px-8">
                <p className="text-balance text-center text-sm leading-loose text-muted-foreground md:text-left">
                    © {new Date().getFullYear()} johnSQL. All rights reserved.
                </p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>UIUC Campus Marketplace</span>
                </div>
            </div>
        </footer>
    )
}
