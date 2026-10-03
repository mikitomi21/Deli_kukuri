import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { createWard } from "@/api/wards"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import useCustomToast from "@/hooks/useCustomToast"
import { normalizePhoneToE164 } from "@/lib/phone"
import { handleError } from "@/utils"

// MVP: stała strefa czasowa — docs/05-api-spec.md (payload POST /wards).
const WARD_TZ = "Europe/Warsaw"

const formSchema = z.object({
  full_name: z.string().trim().min(1, {
    message: "Podaj imię i nazwisko podopiecznego",
  }),
  phone: z
    .string()
    .trim()
    .min(1, { message: "Podaj numer telefonu" })
    .refine((value) => normalizePhoneToE164(value) !== null, {
      message: "Nieprawidłowy numer — wpisz 9 cyfr, np. 600 100 200",
    }),
})

type FormData = z.infer<typeof formSchema>

export const Route = createFileRoute("/_layout/wards/new")({
  component: AddWard,
  head: () => ({
    meta: [
      {
        title: "Dodaj podopiecznego - DzwoniLek",
      },
    ],
  }),
})

function AddWard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      full_name: "",
      phone: "",
    },
  })

  const mutation = useMutation({
    mutationFn: (body: { full_name: string; phone_e164: string; tz: string }) =>
      createWard({ body }),
    onSuccess: () => {
      showSuccessToast("Podopieczny dodany")
      form.reset()
      navigate({ to: "/" })
    },
    onError: handleError.bind(showErrorToast),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["wards"] })
    },
  })

  const onSubmit = (data: FormData) => {
    const phoneE164 = normalizePhoneToE164(data.phone)
    if (!phoneE164) return
    mutation.mutate({
      full_name: data.full_name,
      phone_e164: phoneE164,
      tz: WARD_TZ,
    })
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Dodaj podopiecznego</CardTitle>
          <CardDescription>
            System będzie dzwonił do podopiecznego w godzinach jego rutyn, po
            polsku, i zapisze każdą odpowiedź.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Imię i nazwisko{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        data-testid="ward-name-input"
                        placeholder="np. Halina Kowalska"
                        type="text"
                        {...field}
                        required
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Numer telefonu <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        data-testid="ward-phone-input"
                        placeholder="600 100 200"
                        type="tel"
                        {...field}
                        required
                      />
                    </FormControl>
                    <FormDescription>
                      Dzwonimy pod ten numer. Kierunkowy +48 dodajemy
                      automatycznie.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormItem>
                <FormLabel>Strefa czasowa</FormLabel>
                <FormControl>
                  <Input value={WARD_TZ} type="text" disabled />
                </FormControl>
                <FormDescription>
                  MVP: stała strefa czasowa dla wszystkich podopiecznych.
                </FormDescription>
              </FormItem>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() => navigate({ to: "/" })}
                >
                  Anuluj
                </Button>
                <LoadingButton type="submit" loading={mutation.isPending}>
                  Dodaj podopiecznego
                </LoadingButton>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
