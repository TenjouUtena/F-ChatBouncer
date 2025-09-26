using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace FChatBouncer.Server.Migrations
{
    /// <inheritdoc />
    public partial class AddMemoFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Memo",
                table: "Characters",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "MemoLastUpdated",
                table: "Characters",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Memo",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "MemoLastUpdated",
                table: "Characters");
        }
    }
}
