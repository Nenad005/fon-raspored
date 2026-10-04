-- CreateEnum
CREATE TYPE "TimeslotType" AS ENUM ('P', 'V');

-- CreateEnum
CREATE TYPE "AccountMode" AS ENUM ('account', 'search');

-- CreateEnum
CREATE TYPE "AccountTheme" AS ENUM ('system', 'light', 'dark');

-- CreateTable
CREATE TABLE "subjects" (
    "id" VARCHAR(30) NOT NULL,
    "name" VARCHAR(191) NOT NULL,
    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" VARCHAR(30) NOT NULL,
    "name" VARCHAR(191) NOT NULL,
    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_programs" (
    "subjectId" VARCHAR(30) NOT NULL,
    "programId" VARCHAR(30) NOT NULL,
    "year" SMALLINT NOT NULL,
    CONSTRAINT "subject_programs_pkey" PRIMARY KEY ("subjectId","programId","year")
);

-- CreateTable
CREATE TABLE "study_groups" (
    "id" VARCHAR(30) NOT NULL,
    "name" VARCHAR(191) NOT NULL,
    "year" SMALLINT NOT NULL,
    CONSTRAINT "study_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeslots" (
    "id" VARCHAR(30) NOT NULL,
    "subjectId" VARCHAR(30) NOT NULL,
    "type" "TimeslotType" NOT NULL,
    "day" SMALLINT NOT NULL,
    "startTime" CHAR(5) NOT NULL,
    "endTime" CHAR(5) NOT NULL,
    "room" VARCHAR(191) NOT NULL,
    CONSTRAINT "timeslots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeslot_groups" (
    "timeslotId" VARCHAR(30) NOT NULL,
    "groupId" VARCHAR(30) NOT NULL,
    CONSTRAINT "timeslot_groups_pkey" PRIMARY KEY ("timeslotId","groupId")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "userId" VARCHAR(255) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "mode" "AccountMode" NOT NULL DEFAULT 'account',
    "theme" "AccountTheme" NOT NULL DEFAULT 'system',
    "catalogYear" SMALLINT NOT NULL DEFAULT 1,
    "groupId" VARCHAR(30),
    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "user_subjects" (
    "userId" VARCHAR(255) NOT NULL,
    "subjectId" VARCHAR(30) NOT NULL,
    "position" INTEGER,
    CONSTRAINT "user_subjects_pkey" PRIMARY KEY ("userId","subjectId")
);

-- CreateTable
CREATE TABLE "user_timeslots" (
    "userId" VARCHAR(255) NOT NULL,
    "timeslotId" VARCHAR(30) NOT NULL,
    CONSTRAINT "user_timeslots_pkey" PRIMARY KEY ("userId","timeslotId")
);

-- CreateTable
CREATE TABLE "user_program_filters" (
    "userId" VARCHAR(255) NOT NULL,
    "year" SMALLINT NOT NULL,
    "programId" VARCHAR(30) NOT NULL,
    CONSTRAINT "user_program_filters_pkey" PRIMARY KEY ("userId","year")
);

-- CreateIndex
CREATE UNIQUE INDEX "subjects_name_key" ON "subjects"("name");
CREATE UNIQUE INDEX "programs_name_key" ON "programs"("name");
CREATE INDEX "subject_programs_year_programId_subjectId_idx" ON "subject_programs"("year", "programId", "subjectId");
CREATE INDEX "subject_programs_programId_idx" ON "subject_programs"("programId");
CREATE UNIQUE INDEX "study_groups_year_name_key" ON "study_groups"("year", "name");
CREATE INDEX "timeslots_day_startTime_idx" ON "timeslots"("day", "startTime");
CREATE UNIQUE INDEX "timeslots_subjectId_type_day_startTime_endTime_room_key" ON "timeslots"("subjectId", "type", "day", "startTime", "endTime", "room");
CREATE INDEX "timeslot_groups_groupId_timeslotId_idx" ON "timeslot_groups"("groupId", "timeslotId");
CREATE INDEX "user_settings_groupId_idx" ON "user_settings"("groupId");
CREATE INDEX "user_subjects_subjectId_idx" ON "user_subjects"("subjectId");
CREATE INDEX "user_subjects_userId_position_idx" ON "user_subjects"("userId", "position");
CREATE INDEX "user_timeslots_timeslotId_idx" ON "user_timeslots"("timeslotId");
CREATE INDEX "user_program_filters_programId_idx" ON "user_program_filters"("programId");

-- AddForeignKey
ALTER TABLE "subject_programs" ADD CONSTRAINT "subject_programs_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subject_programs" ADD CONSTRAINT "subject_programs_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timeslots" ADD CONSTRAINT "timeslots_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timeslot_groups" ADD CONSTRAINT "timeslot_groups_timeslotId_fkey" FOREIGN KEY ("timeslotId") REFERENCES "timeslots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timeslot_groups" ADD CONSTRAINT "timeslot_groups_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_subjects" ADD CONSTRAINT "user_subjects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_settings"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_subjects" ADD CONSTRAINT "user_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_timeslots" ADD CONSTRAINT "user_timeslots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_settings"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_timeslots" ADD CONSTRAINT "user_timeslots_timeslotId_fkey" FOREIGN KEY ("timeslotId") REFERENCES "timeslots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_program_filters" ADD CONSTRAINT "user_program_filters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_settings"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_program_filters" ADD CONSTRAINT "user_program_filters_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
