import { errorAtom } from "@/state/errorAtom";
// import { isOpenAtom } from "@/state/isOpenAtom";
import { useAtom } from "jotai";
import { ServerCrash } from "lucide-react";

export default function ErrorMsg({message}) {
  const [error, setError] = useAtom(errorAtom)
  setError(true)
  console.log(error ? '' : '')
  // setIsOpen(true)

  return <div className="flex flex-col items-center gap-5 absolute top-[50%] animate-bounce cursor-pointer">
    <div className="flex gap-5 items-center">
      <ServerCrash size={30} className="text-red-500"></ServerCrash>
      <p className="text-red-500 font-medium text-3xl font-mono tracking-widest">GREŠKA</p>
    </div>
    <p className="relative text-red-500 underline underline-offset-4">{message.replace('Error: ', ' ')}</p>
  </div>
}