import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Suspense } from "react"
import { useTranslation } from "react-i18next"

import {
  type MedicationPublic,
  MedicationsService,
  type UserPublic,
  UsersService,
} from "@/client"
import AddMedication from "@/components/Admin/AddMedication"
import AddUser from "@/components/Admin/AddUser"
import { columns, type UserTableData } from "@/components/Admin/columns"
import { medicationColumns } from "@/components/Admin/medicationColumns"
import { DataTable } from "@/components/Common/DataTable"
import PendingUsers from "@/components/Pending/PendingUsers"
import useAuth from "@/hooks/useAuth"
import i18n from "@/i18n"

function getUsersQueryOptions() {
  return {
    queryFn: async () =>
      (await UsersService.readUsers({ query: { skip: 0, limit: 100 } })).data,
    queryKey: ["users"],
  }
}

function getMedicationsQueryOptions() {
  return {
    queryFn: async () =>
      (
        await MedicationsService.readMedications({
          query: { skip: 0, limit: 100 },
        })
      ).data,
    queryKey: ["medications"],
  }
}

export const Route = createFileRoute("/_layout/admin")({
  component: Admin,
  beforeLoad: async () => {
    const { data: user } = await UsersService.readUserMe()
    if (!user.is_superuser) {
      throw redirect({
        to: "/",
      })
    }
  },
  head: () => ({
    meta: [
      {
        title: i18n.getFixedT(null, "admin")("route.metaTitle"),
      },
    ],
  }),
})

function UsersTableContent() {
  const { user: currentUser } = useAuth()
  const { data: users } = useSuspenseQuery(getUsersQueryOptions())

  const tableData: UserTableData[] = users.data.map((user: UserPublic) => ({
    ...user,
    isCurrentUser: currentUser?.id === user.id,
  }))

  return <DataTable columns={columns} data={tableData} />
}

function UsersTable() {
  return (
    <Suspense fallback={<PendingUsers />}>
      <UsersTableContent />
    </Suspense>
  )
}

function MedicationsTableContent() {
  const { data: medications } = useSuspenseQuery(getMedicationsQueryOptions())

  return (
    <DataTable
      columns={medicationColumns}
      data={medications.data as MedicationPublic[]}
    />
  )
}

function MedicationsTable() {
  return (
    <Suspense fallback={<PendingUsers />}>
      <MedicationsTableContent />
    </Suspense>
  )
}

function Admin() {
  const { t } = useTranslation("admin")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("adminPage.usersTitle")}
          </h1>
          <p className="text-muted-foreground">
            {t("adminPage.usersDescription")}
          </p>
        </div>
        <AddUser />
      </div>
      <UsersTable />
      <div className="mt-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("adminPage.medicationsTitle")}
          </h1>
          <p className="text-muted-foreground">
            {t("adminPage.medicationsDescription")}
          </p>
        </div>
        <AddMedication />
      </div>
      <MedicationsTable />
    </div>
  )
}
