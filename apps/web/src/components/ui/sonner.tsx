import { Toaster as Sonner, type ToasterProps } from 'sonner';

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      toastOptions={{
        classNames: {
          toast: '!rounded-2xl !border-0 !bg-foreground !text-background !shadow-lg',
          description: '!text-background/70',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
