import Link from "next/link";

export default function Footer() {
  return <>
    <header className="w-full flex justify-center border-t absolute bottom-0 left-0 z-10">
      <div className="flex justify-start w-full md:w-[760px] items-center px-5 py-5 gap-3">
        <p className="text-balance text-center text-sm leading-loose text-muted-foreground md:text-left">Built by <Link 
            href={'https://github.com/Nenad005'}
            className="underline underline-offset-4"
            >Nenad005</Link>
          . The source code is available on <Link 
            href={'https://github.com/Nenad005/fon-raspored'} 
            className="underline underline-offset-4"
            >GitHub</Link>.</p>
      </div>
    </header>
  </>
}