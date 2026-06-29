"use client";



import { useTranslation } from "react-i18next";



import { E3_FIELDS, E3_LOCATIONS } from "@/lib/compliance-tracker/constants";

import {

  Select,

  SelectContent,

  SelectItem,

  SelectTrigger,

  SelectValue,

} from "@/components/ui/select";



export type FilterState = {

  location: string;

  field: string;

};



type FilterRowProps = {

  value: FilterState;

  onChange: (next: FilterState) => void;

};



const FIELD_OPTIONS = ["All", ...E3_FIELDS] as const;



const FILTER_I18N = {

  location: { key: "e3Tracker.filters.location", fallback: "Location" },

  field: { key: "e3Tracker.filters.field", fallback: "Field" },

  allLocations: { key: "e3Tracker.filters.allLocations", fallback: "All Locations" },

  allFields: { key: "e3Tracker.filters.allFields", fallback: "All Fields" },

  compliances: { key: "e3Tracker.filters.compliances", fallback: "E3 Compliances" },

  contractors: { key: "e3Tracker.filters.contractors", fallback: "Contractors" },

} as const;



function fieldOptionLabel(field: (typeof FIELD_OPTIONS)[number], t: (key: string, opts?: { defaultValue: string }) => string) {

  if (field === "All") return t(FILTER_I18N.allFields.key, { defaultValue: FILTER_I18N.allFields.fallback });

  if (field === "E3 Compliances") {

    return t(FILTER_I18N.compliances.key, { defaultValue: FILTER_I18N.compliances.fallback });

  }

  return t(FILTER_I18N.contractors.key, { defaultValue: FILTER_I18N.contractors.fallback });

}



export function FilterRow({ value, onChange }: FilterRowProps) {

  const { t } = useTranslation();



  return (

    <div

      className="flex flex-wrap items-center gap-4 rounded-lg px-4 py-3"

      style={{ backgroundColor: "#F2F4F7" }}

    >

      <div className="flex items-center gap-2">

        <span className="font-display text-sm font-semibold text-[#0B1F3A]">

          {t(FILTER_I18N.location.key, { defaultValue: FILTER_I18N.location.fallback })}

        </span>

        <Select

          value={value.location}

          onValueChange={(location) => onChange({ ...value, location })}

        >

          <SelectTrigger className="w-[240px] border-[#E8A33D] bg-white data-[state=open]:ring-[#E8A33D]">

            <SelectValue

              placeholder={t(FILTER_I18N.location.key, { defaultValue: FILTER_I18N.location.fallback })}

            />

          </SelectTrigger>

          <SelectContent>

            <SelectItem value="All">

              {t(FILTER_I18N.allLocations.key, { defaultValue: FILTER_I18N.allLocations.fallback })}

            </SelectItem>

            {E3_LOCATIONS.map((loc) => (

              <SelectItem key={loc} value={loc}>

                {loc}

              </SelectItem>

            ))}

          </SelectContent>

        </Select>

      </div>



      <div className="flex items-center gap-2">

        <span className="font-display text-sm font-semibold text-[#0B1F3A]">

          {t(FILTER_I18N.field.key, { defaultValue: FILTER_I18N.field.fallback })}

        </span>

        <Select value={value.field} onValueChange={(field) => onChange({ ...value, field })}>

          <SelectTrigger className="w-[200px] border-[#E8A33D] bg-white data-[state=open]:ring-[#E8A33D]">

            <SelectValue

              placeholder={t(FILTER_I18N.field.key, { defaultValue: FILTER_I18N.field.fallback })}

            />

          </SelectTrigger>

          <SelectContent>

            {FIELD_OPTIONS.map((field) => (

              <SelectItem key={field} value={field}>

                {fieldOptionLabel(field, t)}

              </SelectItem>

            ))}

          </SelectContent>

        </Select>

      </div>

    </div>

  );

}

