import { Spinner } from '@/components/ui/Spinner'

// Full-view loading state: a spinner centered in the content area that's left
// once the header (h-16) and main's vertical padding (py-10) are accounted for.
export const ViewLoading = (): JSX.Element => (
  <div className="flex min-h-[calc(100svh-9rem)] items-center justify-center">
    <Spinner size="lg" tone="brand" />
  </div>
)
