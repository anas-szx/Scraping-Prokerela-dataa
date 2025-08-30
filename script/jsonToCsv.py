import json
import csv
import os
import argparse
from datetime import datetime

def convert_json_to_csv(json_file_path, csv_file_path):
    """
    Converts a JSON file to a CSV file.

    The JSON file should contain a list of objects, where each object
    represents a row in the resulting CSV.
    """
    try:
        with open(json_file_path, 'r', encoding='utf-8') as json_file:
            data = json.load(json_file)

        date_keys = ['starting_date', 'ending_date']

        for item in data:
            for key in date_keys:
                if key in item and isinstance(item[key], str):
                    try:
                        date_obj = datetime.strptime(item[key], '%d-%m-%Y')
                        item[key] = date_obj.strftime('%d-%b-%Y').lower()
                    except ValueError:
                        print(f"Warning: Date '{item[key]}' in column '{key}' has an invalid format and will not be converted.")
                        pass

        if not isinstance(data, list) or not all(isinstance(item, dict) for item in data):
            print("Error: JSON file must contain a list of objects.")
            return

        if not data:
            print("Warning: JSON file is empty. An empty CSV will be created.")
            with open(csv_file_path, 'w', newline='', encoding='utf-8') as csv_file:
                pass
            return

        with open(csv_file_path, 'w', newline='', encoding='utf-8') as csv_file:
            headers = data[0].keys()

            writer = csv.DictWriter(csv_file, fieldnames=headers)
            writer.writeheader()

            writer.writerows(data)

        print(f"Successfully converted '{json_file_path}' to '{csv_file_path}'")

    except FileNotFoundError:
        print(f"Error: The file '{json_file_path}' was not found.")
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON from the file '{json_file_path}'. Please check its format.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Convert a JSON file to a CSV file.')
    
    parser.add_argument('input_file', type=str, help='The path to the input JSON file.')
    
    parser.add_argument('-o', '--output', type=str, help='The path for the output CSV file. If not provided, it will be derived from the input file name.')

    args = parser.parse_args()

    input_json_file = args.input_file
    output_csv_file = args.output

    if not output_csv_file:
        base_name = os.path.splitext(os.path.basename(input_json_file))[0]
        output_csv_file = os.path.join(os.getcwd(), base_name + '.csv')

    convert_json_to_csv(input_json_file, output_csv_file)

