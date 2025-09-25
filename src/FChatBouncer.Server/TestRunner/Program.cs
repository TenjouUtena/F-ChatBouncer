using FChatBouncer.Server.Tests;

namespace TestRunner;

class Program
{
    static void Main(string[] args)
    {
        if (args.Length == 0)
        {
            Console.WriteLine("Usage: TestRunner <TestClassName>");
            Console.WriteLine("Available tests:");
            Console.WriteLine("  - LISCommandTest");
            Console.WriteLine("  - STACommandTest");
            Console.WriteLine("  - ICHCommandTest");
            return;
        }

        var testClassName = args[0];
        
        try
        {
            switch (testClassName.ToLower())
            {
                case "liscommandtest":
                    LISCommandTest.RunAllTests();
                    break;
                case "stacommandtest":
                    STACommandTest.RunAllTests();
                    break;
                case "ichcommandtest":
                    ICHCommandTest.RunAllTests();
                    break;
                default:
                    Console.WriteLine($"Unknown test class: {testClassName}");
                    break;
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error running test: {ex.Message}");
            Console.WriteLine($"Stack trace: {ex.StackTrace}");
        }
    }
}
