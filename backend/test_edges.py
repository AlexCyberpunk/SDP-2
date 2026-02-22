import sys
sys.path.append("/Volumes/SSD MAC  MINI 2025/Applications/Antigravity/Sea Distances/Eurostat -sea routes/searoute-1.4.3")
from searoute.searoute import setup_M
import networkx as nx

M = setup_M()
edges = list(M.edges(data=True))[:5]
print("Edge sample:", edges)
